import request from "supertest";
import { createApp } from "../app";
import { closePool, query, getPool, withTransaction } from "../db";
import {
  createExchange,
  drawExchange,
  updateExchange,
  authenticateAdminSession,
  changeAdminPassword,
  revokeAdminSession,
} from "../services/exchange.service";
import { createParticipant } from "../services/participant.service";
import { getConfig } from "../lib/config";
import { BoundedStore } from "../middleware/rate-limits";
import { adminContext } from "../lib/admin-context";
import { sha256, verifyPassword, hashPassword } from "../lib/crypto";
import { runDraw } from "../draw-worker";
import { exchangeRepository } from "../repositories/exchange.repository";
import { createParticipantInputSchema } from "@kado/shared";
import fs from "node:fs";
import path from "node:path";
const { solveDraw } = require("../workers/solver.cjs") as {
  solveDraw: (
    ids: string[],
    exclusions: unknown[],
    mutual: boolean,
    nodes: number,
    timeout: number,
    rng?: (n: number) => number,
  ) => Array<{
    giverParticipantId: string;
    receiverParticipantId: string;
  }> | null;
};
const pass = "testpassword123";
async function fixture(count = 3) {
  const result = await createExchange({ name: "P1", adminPassword: pass });
  for (let i = 0; i < count; i++)
    await createParticipant(result.exchange.id, { name: `Member ${i}` });
  return {
    id: result.exchange.id,
    token: result.adminSessionToken,
    auth: { authorization: `Bearer ${result.adminSessionToken}` },
  };
}
beforeEach(async () => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = "test";
  delete process.env.ENABLE_LOCAL_ADMIN_TOOLS;
  delete process.env.FRONTEND_BASE_URL;
  delete process.env.FRONTEND_ALLOWED_ORIGINS;
  delete process.env.TRUST_PROXY_HOPS;
  process.env.MAX_ACTIVE_PARTICIPANTS = "50";
  process.env.DRAW_MAX_NODES = "200000";
  process.env.DRAW_TIMEOUT_MS = "2000";
  process.env.API_RATE_LIMIT = "100000";
  process.env.PARTICIPANT_RATE_LIMIT = "100000";
  process.env.CREATE_RATE_LIMIT = "100000";
  process.env.AUTH_RATE_LIMIT = "100000";
  process.env.AUTH_PAIR_RATE_LIMIT = "100000";
  process.env.DRAW_RATE_LIMIT = "100000";
  await query("TRUNCATE exchanges CASCADE");
});
afterAll(closePool);
it("rejects invalid config and production without explicit HTTPS origins", () => {
  process.env.NODE_ENV = "production";
  expect(getConfig).toThrow();
  process.env.FRONTEND_BASE_URL = "https://kado.test";
  process.env.FRONTEND_ALLOWED_ORIGINS = "https://kado.test";
  expect(getConfig().port).toBe(3000);
  process.env.FRONTEND_ALLOWED_ORIGINS = "http://kado.test";
  expect(getConfig).toThrow();
});
it("limits, retries after window, and isolates app instances", async () => {
  process.env.API_RATE_LIMIT = "2";
  process.env.API_RATE_WINDOW_MS = "50";
  const a = createApp(),
    b = createApp();
  await request(a).get("/api/config").expect(200);
  await request(a).get("/api/config").expect(200);
  const blocked = await request(a).get("/api/config").expect(429);
  expect(blocked.body.error.details.code).toBe("RATE_LIMITED");
  expect(blocked.headers["retry-after"]).toBeDefined();
  expect(blocked.headers.ratelimit).toBeDefined();
  await request(b).get("/api/config").expect(200);
  await new Promise((r) => setTimeout(r, 60));
  await request(a).get("/api/config").expect(200);
});
it("caps store keys without evicting existing clients and releases expired keys", async () => {
  const s = new BoundedStore(1);
  s.init({ windowMs: 100 });
  const clock = jest.spyOn(Date, "now");
  clock.mockReturnValue(1000);
  await s.increment("one");
  await expect(s.increment("two")).rejects.toMatchObject({ statusCode: 503 });
  expect((await s.increment("one")).totalHits).toBe(2);
  clock.mockReturnValue(1101);
  expect((await s.increment("two")).totalHits).toBe(1);
});
it("ignores forwarded IP unless configured and groups IPv6 clients", async () => {
  process.env.API_RATE_LIMIT = "1";
  const a = createApp();
  await request(a)
    .get("/api/config")
    .set("X-Forwarded-For", "192.0.2.1")
    .expect(200);
  await request(a)
    .get("/api/config")
    .set("X-Forwarded-For", "192.0.2.2")
    .expect(429);
  process.env.TRUST_PROXY_HOPS = "1";
  const b = createApp();
  await request(b)
    .get("/api/config")
    .set("X-Forwarded-For", "2001:db8:1234:1::1")
    .expect(200);
  await request(b)
    .get("/api/config")
    .set("X-Forwarded-For", "2001:db8:1234:2::1")
    .expect(429);
  await request(b)
    .get("/api/config")
    .set("X-Forwarded-For", "2001:db9::1")
    .expect(200);
});
it("limits creation before writing and counts failed auth without counting successes", async () => {
  process.env.CREATE_RATE_LIMIT = "1";
  process.env.AUTH_PAIR_RATE_LIMIT = "1";
  const a = createApp();
  const r = await request(a)
    .post("/api/exchanges")
    .send({ name: "Test", adminPassword: pass })
    .expect(201);
  await request(a)
    .post("/api/exchanges")
    .send({ name: "Blocked", adminPassword: pass })
    .expect(429);
  const route = `/api/exchanges/${r.body.exchange.id}/admin/sessions`;
  await request(a).post(route).send({ adminPassword: pass }).expect(201);
  await request(a).post(route).send({ adminPassword: pass }).expect(201);
  await request(a)
    .post(route)
    .send({ adminPassword: "badpassword123" })
    .expect(400);
  await request(a).post(route).send({ adminPassword: pass }).expect(429);
  expect((await query("SELECT count(*) FROM exchanges")).rows[0].count).toBe(
    "1",
  );
});
it("limits participant reads and writes together", async () => {
  const f = await fixture();
  const member = await createParticipant(f.id, { name: "Me" });
  process.env.PARTICIPANT_RATE_LIMIT = "1";
  const a = createApp();
  const token = member.accessLink.split("/").pop();
  await request(a).get(`/api/p/${token}`).expect(200);
  await request(a).put(`/api/p/${token}`).send({ note: "No" }).expect(429);
});
it("requires auth before charging draw quota", async () => {
  const f = await fixture();
  process.env.DRAW_RATE_LIMIT = "1";
  const a = createApp();
  const url = `/api/exchanges/${f.id}/draw`;
  await request(a).post(url).expect(401);
  await request(a).post(url).set(f.auth).expect(200);
  await request(a).post(url).set(f.auth).expect(429);
});
it("returns safe CORS, JSON, size, route and cache errors", async () => {
  process.env.FRONTEND_ALLOWED_ORIGINS = "https://kado.test";
  const a = createApp();
  await request(a)
    .get("/api/config")
    .set("Origin", "https://foreign.test")
    .expect(403);
  await request(a)
    .get("/api/config")
    .set("Origin", "https://kado.test")
    .expect(200);
  expect(
    (
      await request(a)
        .post("/api/exchanges")
        .set("Content-Type", "application/json")
        .send("{")
    ).status,
  ).toBe(400);
  await request(a)
    .post("/api/exchanges")
    .send({ description: "x".repeat(300000) })
    .expect(413);
  const r = await request(a).get("/api/unknown").expect(404);
  expect(r.headers["cache-control"]).toBe("no-store");
  expect(r.headers["referrer-policy"]).toBe("no-referrer");
});
it("logs no token, body, query or unexpected exception text", async () => {
  const log = jest.spyOn(console, "info").mockImplementation(() => {}),
    error = jest.spyOn(console, "error").mockImplementation(() => {});
  const a = createApp();
  await request(a).get("/api/p/secret-token?password=secret-password");
  jest
    .spyOn(exchangeRepository, "findById")
    .mockRejectedValueOnce(new Error("sensitive database secret"));
  await request(a).get("/api/public/exchanges/example").expect(500);
  const text = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
  expect(text).not.toMatch(
    /secret-token|secret-password|sensitive database secret/,
  );
  expect(text).toContain("requestId");
});
it("rotates all sessions atomically and retains only replacement", async () => {
  const f = await fixture();
  const other = await authenticateAdminSession(f.id, pass);
  const a = createApp();
  const replacement = await request(a)
    .put(`/api/exchanges/${f.id}/admin/password`)
    .set(f.auth)
    .send({ currentPassword: pass, newPassword: "newpassword123" })
    .expect(200);
  await request(a).get(`/api/exchanges/${f.id}`).set(f.auth).expect(401);
  await request(a)
    .get(`/api/exchanges/${f.id}`)
    .auth(other.adminSessionToken, { type: "bearer" })
    .expect(401);
  await request(a)
    .get(`/api/exchanges/${f.id}`)
    .auth(replacement.body.adminSessionToken, { type: "bearer" })
    .expect(200);
  expect(
    (await query("SELECT * FROM admin_sessions WHERE exchange_id=$1", [f.id]))
      .rowCount,
  ).toBe(1);
});
it("rolls password and sessions back if replacement fails", async () => {
  const f = await fixture();
  jest
    .spyOn(exchangeRepository, "createAdminSession")
    .mockRejectedValueOnce(new Error("injected"));
  await expect(
    changeAdminPassword(f.id, pass, "newpassword123"),
  ).rejects.toThrow();
  const access = await exchangeRepository.findAdminAccess(f.id);
  expect(await verifyPassword(pass, access!.passwordHash)).toBe(true);
  expect(
    await exchangeRepository.findAdminSessionByTokenHash(sha256(f.token)),
  ).toBeDefined();
});
it.each(["logout", "password"])(
  "revalidates a waiting mutation after %s",
  async (action) => {
    const f = await fixture();
    const client = await getPool().connect();
    await client.query("BEGIN");
    await client.query("SELECT id FROM exchanges WHERE id=$1 FOR UPDATE", [
      f.id,
    ]);
    const operation = adminContext.run(
      { exchangeId: f.id, tokenHash: sha256(f.token) },
      () => updateExchange(f.id, { name: "Unauthorized" }),
    );
    try {
      await client.query("DELETE FROM admin_sessions WHERE exchange_id=$1", [
        f.id,
      ]);
      if (action === "password")
        await client.query(
          "UPDATE admin_access SET password_hash=$2 WHERE exchange_id=$1",
          [f.id, await hashPassword("newpassword123")],
        );
      await client.query("COMMIT");
      await expect(operation).rejects.toMatchObject({ statusCode: 401 });
    } finally {
      client.release();
    }
    expect((await exchangeRepository.findById(f.id))!.name).toBe("P1");
  },
);
it("cleans expired sessions and preserves stored scrypt encoding", async () => {
  const f = await fixture();
  await query(
    "UPDATE admin_sessions SET expires_at=NOW()-interval '1 day' WHERE exchange_id=$1",
    [f.id],
  );
  await authenticateAdminSession(f.id, pass);
  expect(
    (await query("SELECT count(*) FROM admin_sessions")).rows[0].count,
  ).toBe("1");
  const hash = await hashPassword(pass);
  expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  expect(await verifyPassword(pass, hash)).toBe(true);
  expect(await verifyPassword(pass, "malformed")).toBe(false);
});
it("bounds simultaneous scrypt operations", async () => {
  const results = await Promise.allSettled([
    hashPassword(pass),
    hashPassword(pass),
    hashPassword(pass),
  ]);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
});
it("keeps liveness independent from database health and hides errors", async () => {
  const a = createApp();
  await request(a).get("/health/live").expect(200);
  jest
    .spyOn(getPool(), "connect")
    .mockImplementationOnce(() => Promise.reject(new Error("secret")));
  const r = await request(a).get("/health").expect(503);
  expect(r.body.ok).toBe(false);
  expect(JSON.stringify(r.body)).not.toContain("secret");
});
it("bounds lock waits with rollback", async () => {
  const f = await fixture();
  const client = await getPool().connect();
  await client.query("BEGIN");
  await client.query("SELECT id FROM exchanges WHERE id=$1 FOR UPDATE", [f.id]);
  try {
    await expect(
      withTransaction(async (db) => {
        await db.query("SET LOCAL lock_timeout='30ms'");
        await db.query("UPDATE exchanges SET name=$2 WHERE id=$1", [
          f.id,
          "Timeout",
        ]);
      }),
    ).rejects.toMatchObject({ code: "55P03" });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  expect((await exchangeRepository.findById(f.id))!.name).toBe("P1");
});
it("supports non-participating organizers with no access and frozen name after draw", async () => {
  const r = await createExchange({
    name: "Event",
    organizerName: "Host",
    organizerParticipates: false,
    adminPassword: pass,
  });
  expect(r.exchange.organizerId).toBe("");
  expect(r.exchange.organizerName).toBe("Host");
  expect((await query("SELECT count(*) FROM participants")).rows[0].count).toBe(
    "0",
  );
  expect(
    (await query("SELECT count(*) FROM participant_access")).rows[0].count,
  ).toBe("0");
  await updateExchange(r.exchange.id, { organizerName: "Renamed" });
  for (let i = 0; i < 3; i++)
    await createParticipant(r.exchange.id, { name: `P${i}` });
  await drawExchange(r.exchange.id);
  await expect(
    updateExchange(r.exchange.id, { organizerName: "Changed" }),
  ).rejects.toMatchObject({ statusCode: 400 });
  await updateExchange(r.exchange.id, { organizerName: "Renamed" });
});
it("switches independent organizer to an owned participant and applies configured cap", async () => {
  process.env.MAX_ACTIVE_PARTICIPANTS = "3";
  const r = await createExchange({
    name: "Event",
    organizerName: "Host",
    organizerParticipates: false,
    adminPassword: pass,
  });
  const p = await createParticipant(r.exchange.id, { name: "New organizer" });
  await updateExchange(r.exchange.id, { organizerId: p.participant.id });
  expect(
    (await exchangeRepository.findById(r.exchange.id))!.organizerName,
  ).toBeUndefined();
  await createParticipant(r.exchange.id, { name: "Two" });
  await createParticipant(r.exchange.id, { name: "Three" });
  await expect(
    createParticipant(r.exchange.id, { name: "Four" }),
  ).rejects.toMatchObject({ details: { code: "PARTICIPANT_LIMIT_REACHED" } });
});
it("migrates old schema without reinterpreting existing organizers", async () => {
  // A separate schema in the disposable database, not a destructive downgrade of shared fixtures.
  const client = await getPool().connect();
  await client.query("BEGIN");
  try {
    await client.query("CREATE SCHEMA legacy");
    await client.query("SET LOCAL search_path=legacy");
    await client.query(
      fs.readFileSync(path.resolve("migrations/001_init.sql"), "utf8"),
    );
    await client.query(
      "INSERT INTO exchanges(id,name,organizer_id) VALUES('old','Old','organizer')",
    );
    await client.query(
      "INSERT INTO participants(id,exchange_id,name,status) VALUES('organizer','old','Original','active')",
    );
    await client.query(
      fs.readFileSync(
        path.resolve("migrations/002_organizer_name.sql"),
        "utf8",
      ),
    );
    expect(
      (await client.query("SELECT organizer_id,organizer_name FROM exchanges"))
        .rows[0],
    ).toEqual({ organizer_id: "organizer", organizer_name: null });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("validates new URL schemes and lengths", () => {
  for (const url of [
    "javascript:alert(1)",
    "file:///tmp/file",
    "data:text/html,hello",
    "https://example.com/" + "x".repeat(2048),
  ])
    expect(
      createParticipantInputSchema.safeParse({
        name: "Test",
        wishlist: [{ title: "Gift", linkUrl: url }],
      }).success,
    ).toBe(false);
  expect(
    createParticipantInputSchema.safeParse({
      name: "Test",
      wishlist: [{ title: "Gift", linkUrl: "https://example.com/a.jpg" }],
    }).success,
  ).toBe(true);
});
it("uses controllable random choices and verifies constraints across seeds", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const solutions = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    let state = seed;
    const rng = (n: number) => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state % n;
    };
    const a = solveDraw(
      ids,
      [{ giverParticipantId: "a", receiverParticipantId: "b" }],
      true,
      200000,
      2000,
      rng,
    )!;
    solutions.add(JSON.stringify(a));
    expect(new Set(a.map((v) => v.receiverParticipantId)).size).toBe(
      ids.length,
    );
    for (const v of a) {
      expect(v.giverParticipantId).not.toBe(v.receiverParticipantId);
      expect(
        a.some(
          (b) =>
            b.giverParticipantId === v.receiverParticipantId &&
            b.receiverParticipantId === v.giverParticipantId,
        ),
      ).toBe(false);
    }
    expect(
      a.find((v) => v.giverParticipantId === "a")!.receiverParticipantId,
    ).not.toBe("b");
  }
  expect(solutions.size).toBeGreaterThan(1);
  expect(
    solveDraw(
      ["a", "b", "c"],
      [
        { giverParticipantId: "a", receiverParticipantId: "b" },
        { giverParticipantId: "a", receiverParticipantId: "c" },
      ],
      false,
      200000,
      2000,
    ),
  ).toBeNull();
});
it("bounds worker computation, saturation and keeps liveness responsive", async () => {
  process.env.DRAW_MAX_NODES = "1";
  const f = await fixture();
  await expect(drawExchange(f.id)).rejects.toMatchObject({
    details: { code: "DRAW_COMPUTATION_LIMIT" },
  });
  expect((await exchangeRepository.findById(f.id))!.drawAt).toBeUndefined();
  expect((await query("SELECT count(*) FROM assignments")).rows[0].count).toBe(
    "0",
  );
  process.env.DRAW_MAX_NODES = "200000";
  const active = runDraw(["a", "b", "c"], [], false);
  await expect(runDraw(["x", "y", "z"], [], false)).rejects.toMatchObject({
    details: { code: "DRAW_BUSY" },
  });
  await request(createApp()).get("/health/live").expect(200);
  expect(await active).toHaveLength(3);
});
it("invalidates logout context and rejects stale bearer on HTTP mutation", async () => {
  const f = await fixture();
  await revokeAdminSession(f.id, f.token);
  await request(createApp())
    .put(`/api/exchanges/${f.id}`)
    .set(f.auth)
    .send({ name: "No" })
    .expect(401);
});
