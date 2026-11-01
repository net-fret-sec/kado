import request from "supertest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createApp } from "../app";
import { closePool, query } from "../db";
import { cleanPageViews, recordPageView } from "../services/page-views.service";

beforeEach(async () => {
  process.env.API_RATE_LIMIT = "100000";
  delete process.env.API_RATE_WINDOW_MS;
  await query("TRUNCATE page_view_counts, page_view_collection");
  await cleanPageViews();
});
afterAll(closePool);

it("counts atomically with only minute, category and total, without individual request logs", async () => {
  const logs = jest.spyOn(console, "info").mockImplementation(() => {});
  try {
    const app = createApp();
    await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post("/api/page-views")
          .set("X-Forwarded-For", "192.0.2.123")
          .set("Referer", "https://example.test/p/private-token")
          .send({ page: "home" })
          .expect(204),
      ),
    );
    const result = await query("SELECT * FROM page_view_counts");
    expect(result.rows.reduce((n, row) => n + Number(row.views), 0)).toBe(20);
    expect(Object.keys(result.rows[0]).sort()).toEqual([
      "minute",
      "page",
      "views",
    ]);
    expect(JSON.stringify(result.rows)).not.toMatch(/192\.0\.2|private-token/);
    expect(logs).not.toHaveBeenCalled();
    await request(app).get("/api/page-views").expect(404);
  } finally {
    logs.mockRestore();
  }
});

it("rejects unknown fields and arbitrary paths and respects privacy signals", async () => {
  const app = createApp();
  for (const body of [
    {},
    { page: "/p/private" },
    { page: "home", url: "/p/private" },
  ]) {
    await request(app).post("/api/page-views").send(body).expect(400);
  }
  for (const header of ["DNT", "Sec-GPC"]) {
    await request(app)
      .post("/api/page-views")
      .set(header, "1")
      .send({ page: "home" })
      .expect(204);
  }
  expect((await query("SELECT * FROM page_view_counts")).rows).toHaveLength(0);
});

it("applies the existing rate limit before writes", async () => {
  process.env.API_RATE_LIMIT = "1";
  const app = createApp();
  await request(app).post("/api/page-views").send({ page: "home" }).expect(204);
  await request(app).post("/api/page-views").send({ page: "home" }).expect(429);
  expect(
    Number(
      (await query("SELECT sum(views) AS total FROM page_view_counts")).rows[0]
        .total,
    ),
  ).toBe(1);
});

it("purges expired buckets even without traffic and reinitializes after restore", async () => {
  await query(`INSERT INTO page_view_counts VALUES
    (now() - interval '7 days 1 minute', 'home', 99),
    (now() - interval '6 days', 'participant', 3)`);
  await cleanPageViews();
  expect(
    (await query("SELECT page, views FROM page_view_counts")).rows,
  ).toEqual([{ page: "participant", views: "3" }]);
  const original = (await query("SELECT started_at FROM page_view_collection"))
    .rows[0].started_at;
  await cleanPageViews();
  expect(
    (await query("SELECT started_at FROM page_view_collection")).rows[0]
      .started_at,
  ).toEqual(original);
  await query("TRUNCATE page_view_counts, page_view_collection");
  await cleanPageViews();
  expect((await query("SELECT * FROM page_view_collection")).rows).toHaveLength(
    1,
  );
});

it("reports rolling counts, zero categories, local dates and retention without writing", async () => {
  await recordPageView("home");
  await query(`INSERT INTO page_view_counts VALUES
    (date_trunc('minute', now()) - interval '23 hours', 'organizer', 2),
    (date_trunc('minute', now()) - interval '25 hours', 'participant', 4),
    (now() - interval '8 days', 'home', 999)`);
  const script = readFileSync(
    path.resolve(process.cwd(), "../../deploy/scripts/status.mjs"),
    "utf8",
  );
  const report = (format: string) => {
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-", format],
      {
        input: script,
        encoding: "utf8",
        env: process.env,
      },
    );
    expect(child.stderr).toBe("");
    expect(child.status).toBe(0);
    return child.stdout;
  };
  const data = JSON.parse(report("json"));
  expect(data.traffic.last24Hours).toBe(3);
  expect(data.traffic.last7Days).toBe(7);
  expect(data.traffic.byPageLast24Hours).toEqual({
    home: 1,
    organizer: 2,
    participant: 0,
  });
  expect(
    data.traffic.byDay.reduce(
      (n: number, d: { views: number }) => n + d.views,
      0,
    ),
  ).toBe(7);
  expect(data.traffic.collectionStartedAt).toBeTruthy();
  const text = report("text");
  expect(text).toContain("pas des visiteurs uniques");
  expect(text).toContain("Participant : 0");
  expect(
    (await query("SELECT * FROM page_view_counts WHERE views = 999")).rows,
  ).toHaveLength(1);
});
