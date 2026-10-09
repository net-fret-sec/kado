import request from "supertest";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../app";
import { query, closePool, withTransaction } from "../db";
import {
  createExchange,
  drawExchange,
  revokeAdminSession,
} from "../services/exchange.service";
import {
  createParticipant,
  updateParticipant,
  regenerateParticipantAccess,
} from "../services/participant.service";
import { cleanupExpiredImages } from "../services/image.service";
import * as converter from "../image-worker";
import { updateParticipantInputSchema } from "@kado/shared";
let png: Buffer;
const initialEnv = { ...process.env };
beforeAll(async () => {
  png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#f00" },
  })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  jest.restoreAllMocks();
  jest.spyOn(console, "info").mockImplementation(() => {});
  process.env = {
    ...initialEnv,
    NODE_ENV: "test",
    API_RATE_LIMIT: "100000",
    CREATE_RATE_LIMIT: "100000",
    PARTICIPANT_RATE_LIMIT: "100000",
    IMAGE_UPLOAD_RATE_LIMIT: "100000",
  };
  await query("TRUNCATE exchanges CASCADE");
});
afterAll(async () => {
  await converter.stopImageWorker();
  await closePool();
  process.env = initialEnv;
});
async function fixture(count = 3, unlocked = false) {
  const created = await createExchange({
    name: "Images",
    adminPassword: "testpassword123",
    lockSuggestionsAfterDraw: !unlocked,
  });
  const members = [];
  for (let n = 0; n < count; n++)
    members.push(
      await createParticipant(created.exchange.id, { name: `Member ${n}` }),
    );
  return {
    id: created.exchange.id,
    token: created.adminSessionToken,
    auth: { authorization: `Bearer ${created.adminSessionToken}` },
    members,
  };
}
const url = (f: Awaited<ReturnType<typeof fixture>>, n = 0) =>
  `/api/exchanges/${f.id}/participants/${f.members[n]!.participant.id}/images`;
const self = (f: Awaited<ReturnType<typeof fixture>>, n = 0) =>
  "/api" + f.members[n]!.accessLink;
const upload = (
  app: ReturnType<typeof createApp>,
  base: string,
  buffer: Buffer,
  auth?: { authorization: string },
) =>
  request(app)
    .post(base)
    .set(auth ?? {})
    .attach("image", buffer, {
      filename: "private-filename.svg",
      contentType: "image/svg+xml",
    });
async function attach(
  f: Awaited<ReturnType<typeof fixture>>,
  id: string,
  n = 0,
) {
  return updateParticipant(f.id, f.members[n]!.participant.id, {
    wishlist: [
      { title: "Gift", linkUrl: "https://example.com/gift", imageId: id },
    ],
  });
}
const code = (response: request.Response) => response.body.error.details.code;
it("decodes actual bytes, ignores filename/MIME, strips metadata and uses private WebP", async () => {
  const f = await fixture(),
    app = createApp();
  const source = await sharp(png)
    .resize(8, 4)
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const result = await upload(app, url(f), source, f.auth).expect(201);
  expect(result.body).toMatchObject({ width: 4, height: 8 });
  expect(result.body.imageId).toMatch(/^img_/);
  const r = await request(app)
    .get(url(f) + "/" + result.body.imageId)
    .set(f.auth)
    .expect(200);
  expect(r.headers["content-type"]).toMatch(/image\/webp/);
  expect(r.headers["cache-control"]).toBe("no-store");
  expect(r.headers["x-content-type-options"]).toBe("nosniff");
  const meta = await sharp(r.body).metadata();
  expect(meta.format).toBe("webp");
  expect(meta.exif).toBeUndefined();
  expect(meta.orientation).toBeUndefined();
  expect(meta.width).toBe(4);
  expect(result.body.byteSize).toBe(r.body.length);
  expect(
    JSON.stringify((await request(app).get(self(f)).expect(200)).body),
  ).not.toContain(result.body.imageId);
});
it.each([
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  Buffer.from("GIF89a"),
  Buffer.from("not an image"),
])("refuses unsupported/disguised bytes", async (bytes) => {
  const f = await fixture(1);
  expect(
    code(await upload(createApp(), url(f), bytes, f.auth).expect(415)),
  ).toBe("IMAGE_FORMAT_UNSUPPORTED");
});
it("rejects corrupted PNG and malformed multipart, without rows", async () => {
  const f = await fixture(1),
    app = createApp();
  expect(
    code(await upload(app, url(f), png.subarray(0, 12), f.auth).expect(400)),
  ).toBe("IMAGE_INVALID_FILE");
  await request(app)
    .post(url(f))
    .set(f.auth)
    .attach("wrong", png, "x.png")
    .expect(400);
  await request(app)
    .post(url(f))
    .set(f.auth)
    .attach("image", png, "x.png")
    .attach("image", png, "y.png")
    .expect(400);
  await request(app)
    .post(url(f))
    .set(f.auth)
    .field("extra", "x")
    .attach("image", png, "x.png")
    .expect(400);
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("0");
});
it.each([
  "IMAGE_SOURCE_MAX_BYTES",
  "IMAGE_MAX_PIXELS",
  "IMAGE_OUTPUT_MAX_BYTES",
])("bounds %s", async (key) => {
  process.env[key] = "1";
  const f = await fixture(1);
  expect(code(await upload(createApp(), url(f), png, f.auth).expect(413))).toBe(
    "IMAGE_TOO_LARGE",
  );
});
it("resizes without enlarging", async () => {
  process.env.IMAGE_MAX_DIMENSION = "4";
  const f = await fixture(1);
  const r = await upload(createApp(), url(f), png, f.auth).expect(201);
  expect(r.body.width).toBe(4);
  expect(r.body.height).toBe(4);
});
it.each([
  "IMAGE_PARTICIPANT_QUOTA_BYTES",
  "IMAGE_EXCHANGE_QUOTA_BYTES",
  "IMAGE_TOTAL_QUOTA_BYTES",
])("counts temporary images in %s", async (key) => {
  const f = await fixture(1),
    app = createApp();
  const first = await upload(app, url(f), png, f.auth).expect(201);
  process.env[key] = String(first.body.byteSize);
  expect(code(await upload(app, url(f), png, f.auth).expect(413))).toBe(
    "IMAGE_QUOTA_EXCEEDED",
  );
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("1");
});
it("keeps images private until commit, exposes only current recipient references, then hides detached images", async () => {
  const f = await fixture(3, true),
    app = createApp();
  const { body: image } = await upload(app, url(f), png, f.auth).expect(201);
  await drawExchange(f.id);
  const giver = (
    await query(
      "SELECT giver_participant_id FROM assignments WHERE receiver_participant_id=$1",
      [f.members[0]!.participant.id],
    )
  ).rows[0].giver_participant_id;
  const donor = f.members.findIndex((m) => m.participant.id === giver),
    other = [1, 2].find((n) => n !== donor)!;
  await request(app)
    .get(self(f, donor) + "/images/" + image.imageId)
    .expect(404);
  await attach(f, image.imageId);
  await request(app)
    .get(self(f, donor) + "/images/" + image.imageId)
    .expect(200);
  await request(app)
    .get(self(f, other) + "/images/" + image.imageId)
    .expect(404);
  const publicView = await request(app)
    .get(`/api/public/exchanges/${f.id}`)
    .expect(200);
  expect(JSON.stringify(publicView.body)).not.toContain(image.imageId);
  await updateParticipant(f.id, f.members[0]!.participant.id, { wishlist: [] });
  await request(app)
    .get(self(f, donor) + "/images/" + image.imageId)
    .expect(404);
  await request(app)
    .get(self(f) + "/images/" + image.imageId)
    .expect(200);
  expect(
    (await query("SELECT expires_at FROM suggestion_images")).rows[0]
      .expires_at,
  ).toBeTruthy();
});
it("rejects foreign references atomically and distinguishes neither foreign nor missing images", async () => {
  const a = await fixture(2),
    b = await fixture(1),
    app = createApp();
  const image = (await upload(app, url(b), png, b.auth)).body.imageId;
  const before = await query(
    "SELECT name,wishlist,updated_at FROM participants WHERE id=$1",
    [a.members[0]!.participant.id],
  );
  await expect(
    updateParticipant(a.id, a.members[0]!.participant.id, {
      name: "Changed",
      wishlist: [{ title: "Foreign", imageId: image }],
    }),
  ).rejects.toMatchObject({ details: { code: "IMAGE_REFERENCE_INVALID" } });
  expect(
    (
      await query(
        "SELECT name,wishlist,updated_at FROM participants WHERE id=$1",
        [a.members[0]!.participant.id],
      )
    ).rows,
  ).toEqual(before.rows);
  const foreign = await request(app)
    .get(url(a) + "/" + image)
    .set(a.auth)
    .expect(404);
  const missing = await request(app)
    .get(url(a) + "/img_missing")
    .set(a.auth)
    .expect(404);
  expect(foreign.body).toEqual(missing.body);
  await upload(app, url(b), png, a.auth).expect(401);
  await request(app)
    .get(url(b) + "/" + image)
    .set(a.auth)
    .expect(401);
  await request(app)
    .get(url(a, 1) + "/" + image)
    .set(a.auth)
    .expect(404);
});
it("supports participant upload and rejects revoked tokens and sessions", async () => {
  const f = await fixture(1),
    app = createApp();
  const image = (await upload(app, self(f) + "/images", png).expect(201)).body
    .imageId;
  await regenerateParticipantAccess(f.id, f.members[0]!.participant.id, true);
  await request(app)
    .get(self(f) + "/images/" + image)
    .expect(404);
  await upload(app, self(f) + "/images", png).expect(404);
  await revokeAdminSession(f.id, f.token);
  await upload(app, url(f), png, f.auth).expect(401);
});
it("rejects uploads after locked draw or archiving, but permits consultation", async () => {
  const f = await fixture(),
    app = createApp();
  const image = (await upload(app, url(f), png, f.auth)).body.imageId;
  await drawExchange(f.id);
  expect(code(await upload(app, url(f), png, f.auth).expect(400))).toBe(
    "PARTICIPANT_SUGGESTIONS_LOCKED",
  );
  await query("UPDATE exchanges SET event_date='2000-01-01' WHERE id=$1", [
    f.id,
  ]);
  await upload(app, self(f) + "/images", png).expect(400);
  await request(app)
    .get(url(f) + "/" + image)
    .set(f.auth)
    .expect(200);
});
it("refuses saturation, keeps liveness responsive, revalidates permissions after conversion", async () => {
  const f = await fixture(),
    app = createApp();
  let resolve!: (value: {
    content: Buffer;
    width: number;
    height: number;
  }) => void;
  const started = new Promise<void>((ready) =>
    jest.spyOn(converter, "transformImage").mockImplementation(() => {
      ready();
      return new Promise((r) => {
        resolve = r;
      });
    }),
  );
  const pending = upload(app, url(f), png, f.auth).then((r) => r);
  await started;
  expect(code(await upload(app, url(f), png, f.auth).expect(503))).toBe(
    "IMAGE_UPLOAD_BUSY",
  );
  await request(app).get("/health/live").expect(200);
  await drawExchange(f.id);
  resolve({ content: png, width: 8, height: 8 });
  expect(code(await pending)).toBe("PARTICIPANT_SUGGESTIONS_LOCKED");
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("0");
});
it("revalidates revoked sessions after processing and releases the slot on failure", async () => {
  const f = await fixture(1),
    app = createApp();
  let resolve!: (value: {
    content: Buffer;
    width: number;
    height: number;
  }) => void;
  const started = new Promise<void>((ready) =>
    jest.spyOn(converter, "transformImage").mockImplementation(() => {
      ready();
      return new Promise((r) => {
        resolve = r;
      });
    }),
  );
  const pending = upload(app, url(f), png, f.auth).then((r) => r);
  await started;
  await revokeAdminSession(f.id, f.token);
  resolve({ content: png, width: 8, height: 8 });
  expect((await pending).status).toBe(401);
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("0");
});
it("kills timed-out converters, releases slot and succeeds on next explicit attempt", async () => {
  const f = await fixture(1),
    app = createApp();
  process.env.IMAGE_TRANSFORM_TIMEOUT_MS = "1";
  expect(code(await upload(app, url(f), png, f.auth).expect(503))).toBe(
    "IMAGE_PROCESSING_INTERRUPTED",
  );
  process.env.IMAGE_TRANSFORM_TIMEOUT_MS = "5000";
  await upload(app, url(f), png, f.auth).expect(201);
});
it("rate limits uploads before conversion", async () => {
  process.env.IMAGE_UPLOAD_RATE_LIMIT = "1";
  const f = await fixture(1),
    app = createApp();
  await upload(app, url(f), png, f.auth).expect(201);
  const blocked = await upload(app, url(f), png, f.auth).expect(429);
  expect(blocked.headers["retry-after"]).toBeDefined();
});
it("reattaches detached images, cleans expired batches and cascades exchange deletion", async () => {
  const f = await fixture(1),
    app = createApp();
  const a = (await upload(app, url(f), png, f.auth)).body.imageId,
    b = (await upload(app, url(f), png, f.auth)).body.imageId;
  await attach(f, a);
  await attach(f, b);
  await attach(f, a);
  await query(
    "UPDATE suggestion_images SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
    [b],
  );
  await expect(attach(f, b)).rejects.toMatchObject({
    details: { code: "IMAGE_REFERENCE_INVALID" },
  });
  expect(await cleanupExpiredImages(1)).toBe(1);
  expect(
    (await query("SELECT id,expires_at FROM suggestion_images")).rows,
  ).toEqual([{ id: a, expires_at: null }]);
  await query("DELETE FROM exchanges WHERE id=$1", [f.id]);
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("0");
});
it("rejects removed fields, permits empty wishlist and migrates legacy arrays preserving order/version", async () => {
  expect(updateParticipantInputSchema.safeParse({ wishlist: [] }).success).toBe(
    true,
  );
  for (const key of ["icon", "imageUrl"])
    expect(
      updateParticipantInputSchema.safeParse({
        wishlist: [{ title: "Gift", [key]: "old" }],
      }).success,
    ).toBe(false);
  await withTransaction(async (db) => {
    await query(
      "CREATE SCHEMA image_migration_test; SET LOCAL search_path TO image_migration_test",
      [],
      db,
    );
    for (const file of ["001_init.sql", "002_organizer_name.sql"])
      await query(
        fs.readFileSync(
          path.resolve(__dirname, "../../migrations", file),
          "utf8",
        ),
        [],
        db,
      );
    await query(
      "INSERT INTO exchanges(id,name,organizer_id) VALUES('e','Old','')",
      [],
      db,
    );
    const old = [
      {
        title: "First",
        linkUrl: "https://example.com",
        icon: "book",
        imageUrl: "https://example.com/i",
      },
      { title: "Second", icon: "gift" },
    ];
    await query(
      "INSERT INTO participants(id,exchange_id,name,status,wishlist,updated_at) VALUES('p','e','Member','active',$1,'2020-01-01')",
      [JSON.stringify(old)],
      db,
    );
    await query(
      fs.readFileSync(
        path.resolve(__dirname, "../../migrations/003_suggestion_images.sql"),
        "utf8",
      ),
      [],
      db,
    );
    const p = (
      await query("SELECT wishlist,updated_at FROM participants", [], db)
    ).rows[0];
    expect(p.wishlist).toEqual([
      { title: "First", linkUrl: "https://example.com" },
      { title: "Second" },
    ]);
    expect(p.updated_at.getTime()).toBeGreaterThan(Date.parse("2020-01-01"));
    await query(
      "SET LOCAL search_path TO public; DROP SCHEMA image_migration_test CASCADE",
      [],
      db,
    );
  });
});
it("refuses animated WebP and APNG, accepts static WebP", async () => {
  const f = await fixture(1),
    app = createApp();
  const second = await sharp(png).negate().png().toBuffer();
  const animated = await sharp([png, second], { join: { animated: true } })
    .webp()
    .toBuffer();
  expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
  expect(code(await upload(app, url(f), animated, f.auth).expect(415))).toBe(
    "IMAGE_FORMAT_UNSUPPORTED",
  );
  // acTL marker must be rejected even when the decoder would ignore APNG frames.
  const chunk = Buffer.alloc(20);
  chunk.writeUInt32BE(8);
  chunk.write("acTL", 4);
  chunk.writeUInt32BE(2, 8);
  await upload(
    app,
    url(f),
    Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]),
    f.auth,
  ).expect(415);
  await upload(app, url(f), await sharp(png).webp().toBuffer(), f.auth).expect(
    201,
  );
});
it("does not delete an image reattached while cleanup waits for the exchange lock", async () => {
  const f = await fixture(1),
    app = createApp();
  const image = (await upload(app, url(f), png, f.auth)).body.imageId;
  const { getPool } = await import("../db"),
    client = await getPool().connect();
  try {
    await query(
      "UPDATE suggestion_images SET expires_at=clock_timestamp()+interval '50 milliseconds' WHERE id=$1",
      [image],
    );
    await client.query("BEGIN");
    await client.query("SELECT id FROM exchanges WHERE id=$1 FOR UPDATE", [
      f.id,
    ]);
    // Simulate attachment validated before expiry, completed after the cleanup candidate read.
    await new Promise((r) => setTimeout(r, 80));
    const cleanup = cleanupExpiredImages();
    await new Promise((r) => setTimeout(r, 40));
    await client.query(
      "UPDATE suggestion_images SET expires_at=NULL WHERE id=$1",
      [image],
    );
    await client.query("COMMIT");
    await cleanup;
    expect(
      (await query("SELECT id FROM suggestion_images WHERE id=$1", [image]))
        .rowCount,
    ).toBe(1);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("logs normalized image routes without tokens or filenames", async () => {
  const f = await fixture(1),
    app = createApp();
  const logs = jest.spyOn(console, "info");
  await upload(app, self(f) + "/images", png).expect(201);
  const text = JSON.stringify(logs.mock.calls);
  expect(text).toContain("/api/p/:token/images");
  expect(text).not.toContain("private-filename");
  expect(text).not.toContain(f.members[0]!.accessLink.split("/").pop());
});
it("bounds a stalled multipart reception and releases its slot", async () => {
  process.env.IMAGE_RECEIVE_TIMEOUT_MS = "30";
  const f = await fixture(1),
    app = createApp();
  const http = await import("node:http");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  try {
    const port = (server.address() as { port: number }).port;
    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = http.request(
          {
            host: "127.0.0.1",
            port,
            method: "POST",
            path: url(f),
            headers: {
              ...f.auth,
              "Content-Type": "multipart/form-data; boundary=stalled",
              "Content-Length": 1000,
            },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode!, body }));
          },
        );
        req.on("error", reject);
        req.write(
          '--stalled\r\nContent-Disposition: form-data; name="image"; filename="secret"\r\nContent-Type: image/png\r\n\r\n',
        );
      },
    );
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body).error.details.code).toBe(
      "IMAGE_PROCESSING_INTERRUPTED",
    );
    process.env.IMAGE_RECEIVE_TIMEOUT_MS = "10000";
    await upload(app, url(f), png, f.auth).expect(201);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("rolls back a failure after binary insertion without a partial image", async () => {
  const f = await fixture(1),
    app = createApp(),
    repo = await import("../repositories/image.repository"),
    original = repo.insertImage;
  const spy = jest
    .spyOn(repo, "insertImage")
    .mockImplementation(async (...args) => {
      await original(...args);
      throw new Error("Injected failure");
    });
  await upload(app, url(f), png, f.auth).expect(500);
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("0");
  spy.mockRestore();
  await upload(app, url(f), png, f.auth).expect(201);
});
it("revalidates participant rotation after conversion", async () => {
  const f = await fixture(1),
    app = createApp();
  let resolve!: (value: {
    content: Buffer;
    width: number;
    height: number;
  }) => void;
  const started = new Promise<void>((ready) =>
    jest.spyOn(converter, "transformImage").mockImplementation(() => {
      ready();
      return new Promise((r) => {
        resolve = r;
      });
    }),
  );
  const pending = upload(app, self(f) + "/images", png).then((r) => r);
  await started;
  await regenerateParticipantAccess(f.id, f.members[0]!.participant.id, true);
  resolve({ content: png, width: 8, height: 8 });
  expect((await pending).status).toBe(404);
  expect(
    (await query("SELECT count(*) FROM suggestion_images")).rows[0].count,
  ).toBe("0");
});
it("terminates the active conversion on shutdown and allows subsequent processing", async () => {
  const pending = expect(converter.transformImage(png)).rejects.toMatchObject({
    statusCode: 503,
    details: { code: "IMAGE_PROCESSING_INTERRUPTED" },
  });
  await converter.stopImageWorker();
  await pending;
  expect((await converter.transformImage(png)).width).toBe(8);
});
