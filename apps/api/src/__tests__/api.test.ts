import request from "supertest";
import { createApp } from "../app";
import { closePool, query } from "../db";
import { exchangeRepository } from "../repositories/exchange.repository";
import { participantRepository } from "../repositories/participant.repository";
import { assignmentRepository } from "../repositories/assignment.repository";
import {
  createExchange,
  drawExchange,
  cancelExchangeDraw,
  updateExchange,
} from "../services/exchange.service";
import {
  createParticipant,
  regenerateParticipantAccess,
  deleteParticipant,
  getParticipantSelfViewByToken,
} from "../services/participant.service";
import { createExclusionRule } from "../services/exclusion-rule.service";
import {
  archiveAt,
  getExchangeTimeZone,
  isExchangeArchived,
} from "../lib/exchange-state";
import type { CreateExchangeInputDto } from "@kado/shared";

const app = createApp();
const password = "testpassword123";
function path(id: string) {
  return `/api/exchanges/${id}`;
}
async function fixture(
  options: Partial<CreateExchangeInputDto> = {},
  count = 3,
) {
  const { exchange, adminSessionToken } = await createExchange({
    name: "Test",
    adminPassword: password,
    ...options,
  });
  const members = [];
  for (let i = 0; i < count; i++)
    members.push(
      await createParticipant(exchange.id, {
        name: `Member ${i}`,
        email: `member${i}@example.com`,
        wishlist: [{ title: "Gift" }],
        note: "Private note",
      }),
    );
  return {
    id: exchange.id,
    members,
    auth: { authorization: `Bearer ${adminSessionToken}` },
    token: members[0]?.accessLink.split("/").pop() ?? "",
  };
}
beforeEach(async () => {
  jest.restoreAllMocks();
  process.env.NODE_ENV = "test";
  delete process.env.ENABLE_LOCAL_ADMIN_TOOLS;
  process.env.EXCHANGE_TIME_ZONE = "America/Toronto";
  await query("TRUNCATE exchanges CASCADE");
});
afterAll(closePool);

// Inspect real PostgreSQL waits to release a held transaction only once its competitor is blocked.
async function waitForParentLock() {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await query<{ waiting: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%') AS waiting",
    );
    if (result.rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Competing operation did not wait for the exchange lock");
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function heldDraw(id: string, competitor: () => Promise<unknown>) {
  const reached = deferred(),
    release = deferred();
  const original = participantRepository.findByExchangeId.bind(
    participantRepository,
  );
  jest
    .spyOn(participantRepository, "findByExchangeId")
    .mockImplementationOnce(async (...args) => {
      reached.resolve();
      await release.promise;
      return original(...args);
    });
  const first = drawExchange(id);
  await reached.promise;
  const second = competitor();
  try {
    await waitForParentLock();
  } finally {
    release.resolve();
  }
  return Promise.allSettled([first, second]);
}
async function validAssignments(id: string) {
  const participants = (
    await participantRepository.findByExchangeId(id)
  ).filter((p) => p.status === "active");
  const assignments = await assignmentRepository.findByExchangeId(id);
  const exclusions = await query<{
    giver_participant_id: string;
    receiver_participant_id: string;
  }>("SELECT * FROM exclusion_rules WHERE exchange_id=$1", [id]);
  const exchange = await exchangeRepository.findById(id);
  expect(assignments).toHaveLength(participants.length);
  expect(new Set(assignments.map((a) => a.giverParticipantId)).size).toBe(
    participants.length,
  );
  expect(new Set(assignments.map((a) => a.receiverParticipantId)).size).toBe(
    participants.length,
  );
  const ids = new Set(participants.map((p) => p.id));
  for (const a of assignments) {
    expect(
      ids.has(a.giverParticipantId) && ids.has(a.receiverParticipantId),
    ).toBe(true);
    expect(a.giverParticipantId).not.toBe(a.receiverParticipantId);
    expect(
      exclusions.rows.some(
        (e) =>
          e.giver_participant_id === a.giverParticipantId &&
          e.receiver_participant_id === a.receiverParticipantId,
      ),
    ).toBe(false);
    if (exchange?.noMutualAssignments)
      expect(
        assignments.some(
          (b) =>
            b.giverParticipantId === a.receiverParticipantId &&
            b.receiverParticipantId === a.giverParticipantId,
        ),
      ).toBe(false);
  }
}

describe("Confidentiality and ownership", () => {
  it.each(["test", "production", "development"])(
    "hides the list by default in %s",
    async (mode) => {
      await fixture();
      process.env.NODE_ENV = mode;
      await request(app)
        .get("/api/exchanges")
        .expect(404, { error: { message: "Not found." } });
    },
  );
  it("refuses production even with local tools enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_LOCAL_ADMIN_TOOLS = "true";
    await request(app).get("/api/exchanges").expect(404);
  });
  it("allows explicitly enabled loopback tooling, refusing forwarded and remote-origin requests", async () => {
    await fixture();
    process.env.NODE_ENV = "development";
    process.env.ENABLE_LOCAL_ADMIN_TOOLS = "true";
    const result = await request(app).get("/api/exchanges").expect(200);
    expect(result.body).toHaveLength(1);
    for (const header of ["forwarded", "x-forwarded-for", "x-forwarded-host"])
      await request(app)
        .get("/api/exchanges")
        .set(header, "127.0.0.1")
        .expect(404);
    await request(app)
      .get("/api/exchanges")
      .set("Origin", "https://evil.example")
      .expect(404);
    await request(app)
      .get("/api/exchanges")
      .set("Host", "evil.example")
      .expect(404);
  });
  it("uses an explicit public response with no admin or participant fields", async () => {
    const f = await fixture();
    const result = await request(app)
      .get(`/api/public/exchanges/${f.id}`)
      .expect(200);
    expect(Object.keys(result.body).sort()).toEqual(
      [
        "id",
        "name",
        "isDrawn",
        "isArchived",
        "minWishlistSuggestions",
        "lockSuggestionsAfterDraw",
        "noMutualAssignments",
        "updatedAt",
        "organizerName",
        "participantsCount",
      ].sort(),
    );
    expect(JSON.stringify(result.body)).not.toContain("member0@example.com");
  });
  it("requires an admin session for individual management", async () => {
    const f = await fixture();
    await request(app).get(path(f.id)).expect(401);
    await request(app)
      .put(`${path(f.id)}/participants/${f.members[0].participant.id}`)
      .send({ name: "Attack" })
      .expect(401);
  });
  it.each(["get", "put", "delete", "rotate"] as const)(
    "rejects cross-exchange %s identically to missing participants",
    async (method) => {
      const a = await fixture(),
        b = await fixture();
      const id = b.members[0].participant.id;
      async function attempt(target: string) {
        const base = `${path(a.id)}/participants/${target}`;
        if (method === "get") return request(app).get(base).set(a.auth);
        if (method === "put")
          return request(app).put(base).set(a.auth).send({ name: "Attack" });
        if (method === "delete") return request(app).delete(base).set(a.auth);
        return request(app)
          .post(`${base}/access/regenerate`)
          .set(a.auth)
          .send({});
      }
      const before = await participantRepository.findById(b.id, id);
      const cross = await attempt(id),
        missing = await attempt("missing");
      expect(cross.status).toBe(404);
      expect(cross.body).toEqual(missing.body);
      expect(cross.body.error.details.code).toBe("PARTICIPANT_NOT_FOUND");
      expect(await participantRepository.findById(b.id, id)).toEqual(before);
      await request(app).get(`/api/p/${b.token}`).expect(200);
    },
  );
  it("rejects inactive participants and inconsistent access ownership uniformly", async () => {
    const a = await fixture(),
      b = await fixture();
    await participantRepository.update(a.id, a.members[0].participant.id, {
      status: "removed",
    });
    const inactive = await request(app).get(`/api/p/${a.token}`).expect(404);
    await query(
      "UPDATE participant_access SET exchange_id=$1 WHERE participant_id=$2",
      [a.id, b.members[0].participant.id],
    );
    const inconsistent = await request(app)
      .get(`/api/p/${b.token}`)
      .expect(404);
    const unknown = await request(app).get("/api/p/AAAAAAAAAAAA").expect(404);
    const malformed = await request(app).get("/api/p/bad").expect(404);
    expect(inactive.body).toEqual(unknown.body);
    expect(inconsistent.body).toEqual(unknown.body);
    expect(malformed.body).toEqual(unknown.body);
  });
});

describe("Transactions and concurrency", () => {
  it("rolls back exchange, organizer, access and auth on session failure", async () => {
    jest
      .spyOn(exchangeRepository, "createAdminSession")
      .mockRejectedValueOnce(new Error("injected"));
    await expect(
      createExchange({
        name: "Test",
        organizerName: "Organizer",
        adminPassword: password,
      }),
    ).rejects.toThrow("injected");
    for (const table of [
      "exchanges",
      "participants",
      "participant_access",
      "admin_access",
      "admin_sessions",
    ]) {
      expect(
        (await query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0]
          .count,
      ).toBe(0);
    }
  });
  it("rolls back participant creation and failed token rotation", async () => {
    const f = await fixture({}, 1);
    jest
      .spyOn(participantRepository, "createAccess")
      .mockRejectedValueOnce(new Error("injected"));
    await expect(createParticipant(f.id, { name: "Failed" })).rejects.toThrow(
      "injected",
    );
    expect(await participantRepository.findByExchangeId(f.id)).toHaveLength(1);
    jest
      .spyOn(participantRepository, "createAccess")
      .mockRejectedValueOnce(new Error("injected"));
    await expect(
      regenerateParticipantAccess(f.id, f.members[0].participant.id),
    ).rejects.toThrow("injected");
    await request(app).get(`/api/p/${f.token}`).expect(200);
  });
  it("serializes double draws without replacing assignments", async () => {
    const f = await fixture({ noMutualAssignments: true });
    const results = await heldDraw(f.id, () => drawExchange(f.id));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    if (results[0].status === "fulfilled" && results[1].status === "fulfilled")
      expect(results[0].value).toEqual(results[1].value);
    const before = await assignmentRepository.findByExchangeId(f.id);
    await drawExchange(f.id);
    expect(await assignmentRepository.findByExchangeId(f.id)).toEqual(before);
    await validAssignments(f.id);
  });
  it.each(["add", "delete", "exclude"] as const)(
    "draw serializes against %s and rejects incompatible mutation",
    async (action) => {
      const f = await fixture();
      const mutation = () =>
        action === "add"
          ? createParticipant(f.id, { name: "Late" })
          : action === "delete"
            ? deleteParticipant(f.id, f.members[0].participant.id)
            : createExclusionRule(f.id, {
                giverParticipantId: f.members[0].participant.id,
                receiverParticipantId: f.members[1].participant.id,
              });
      const result = await heldDraw(f.id, mutation);
      expect(result[0].status).toBe("fulfilled");
      expect(result[1].status).toBe("rejected");
      await validAssignments(f.id);
    },
  );
  it("draw followed by waiting cancellation returns to an untiré state", async () => {
    const f = await fixture();
    const result = await heldDraw(f.id, () => cancelExchangeDraw(f.id));
    expect(result.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await exchangeRepository.findById(f.id))?.drawAt).toBeUndefined();
    expect(await assignmentRepository.findByExchangeId(f.id)).toHaveLength(0);
  });
  it("mutation committed before a waiting draw is included in its snapshot", async () => {
    const f = await fixture();
    const reached = deferred(),
      release = deferred();
    const original = participantRepository.create.bind(participantRepository);
    jest
      .spyOn(participantRepository, "create")
      .mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        reached.resolve();
        await release.promise;
        return result;
      });
    const add = createParticipant(f.id, { name: "Before" });
    await reached.promise;
    const draw = drawExchange(f.id);
    try {
      await waitForParentLock();
    } finally {
      release.resolve();
    }
    await Promise.all([add, draw]);
    await validAssignments(f.id);
    expect(await assignmentRepository.findByExchangeId(f.id)).toHaveLength(4);
  });
  it("concurrent replacing rotations leave only the last committed link active", async () => {
    const f = await fixture();
    const links = await Promise.all([
      regenerateParticipantAccess(f.id, f.members[0].participant.id),
      regenerateParticipantAccess(f.id, f.members[0].participant.id),
    ]);
    const statuses = await Promise.all(
      links.map((l) =>
        request(app)
          .get(`/api${l.accessLink}`)
          .then((r) => r.status),
      ),
    );
    expect(statuses.sort()).toEqual([200, 404]);
    await request(app).get(`/api/p/${f.token}`).expect(404);
    const access = await query(
      "SELECT * FROM participant_access WHERE participant_id=$1 AND status='active'",
      [f.members[0].participant.id],
    );
    expect(access.rows).toHaveLength(1);
  });
  it("revalidates an old token after a waiting rotation commits", async () => {
    const f = await fixture();
    const reached = deferred(),
      release = deferred();
    const original = participantRepository.createAccess.bind(
      participantRepository,
    );
    jest
      .spyOn(participantRepository, "createAccess")
      .mockImplementationOnce(async (...args) => {
        reached.resolve();
        await release.promise;
        return original(...args);
      });
    const rotate = regenerateParticipantAccess(
      f.id,
      f.members[0].participant.id,
    );
    await reached.promise;
    const read = getParticipantSelfViewByToken(f.token);
    // Attach rejection handler immediately; the read must wait for the rotation.
    const outcome = Promise.allSettled([rotate, read]);
    try {
      await waitForParentLock();
    } finally {
      release.resolve();
    }
    const results = await outcome;
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    if (results[1].status === "rejected")
      expect(results[1].reason.details.code).toBe(
        "PARTICIPANT_LINK_INVALID_OR_EXPIRED",
      );
  });
  it("can retain an existing link explicitly", async () => {
    const f = await fixture();
    const link = await regenerateParticipantAccess(
      f.id,
      f.members[0].participant.id,
      false,
    );
    await request(app).get(`/api/p/${f.token}`).expect(200);
    await request(app).get(`/api${link.accessLink}`).expect(200);
  });
});

describe("Business state and contracts", () => {
  it("supports create, edit, participants, exclusions, draw, self view, cancellation, rotation and delete", async () => {
    const created = await request(app)
      .post("/api/exchanges")
      .send({ name: "HTTP", adminPassword: password })
      .expect(201);
    const id = created.body.exchange.id;
    const auth = { authorization: `Bearer ${created.body.adminSessionToken}` };
    await request(app).put(path(id)).set(auth).send({ budget: 50 }).expect(200);
    const members = [];
    for (let i = 0; i < 3; i++)
      members.push(
        (
          await request(app)
            .post(`${path(id)}/participants`)
            .set(auth)
            .send({ name: `HTTP ${i}` })
            .expect(201)
        ).body,
      );
    const rule = await request(app)
      .post(`${path(id)}/exclusions`)
      .set(auth)
      .send({
        giverParticipantId: members[0].participant.id,
        receiverParticipantId: members[1].participant.id,
      })
      .expect(201);
    await request(app)
      .post(`${path(id)}/draw`)
      .set(auth)
      .expect(200);
    await validAssignments(id);
    const view = await request(app)
      .get(`/api${members[0].accessLink}`)
      .expect(200);
    expect(view.body.assignment).toBeDefined();
    await request(app)
      .post(`${path(id)}/draw/cancel`)
      .set(auth)
      .expect(200);
    await request(app)
      .delete(`${path(id)}/exclusions/${rule.body.id}`)
      .set(auth)
      .expect(204);
    const link = await request(app)
      .post(
        `${path(id)}/participants/${members[0].participant.id}/access/regenerate`,
      )
      .set(auth)
      .send({})
      .expect(201);
    await request(app).get(`/api${members[0].accessLink}`).expect(404);
    await request(app).get(`/api${link.body.accessLink}`).expect(200);
    await request(app).delete(path(id)).set(auth).expect(204);
    await request(app).get(`/api${link.body.accessLink}`).expect(404);
  });
  it.each([true, false])(
    "enforces drawn profile and wishlist policy with lock=%s for both actors",
    async (lock) => {
      const f = await fixture({ lockSuggestionsAfterDraw: lock });
      await drawExchange(f.id);
      const url = `${path(f.id)}/participants/${f.members[0].participant.id}`;
      for (const actor of ["admin", "self"]) {
        const put = (body: object) =>
          actor === "admin"
            ? request(app).put(url).set(f.auth).send(body)
            : request(app).put(`/api/p/${f.token}`).send(body);
        await put({ name: "Changed" }).expect(400);
        await put({ email: "changed@example.com" }).expect(400);
        await put({ name: "Member 0", email: "member0@example.com" }).expect(
          200,
        );
        await put({
          wishlist: [{ title: `New ${actor}` }],
          note: `New ${actor}`,
        }).expect(lock ? 400 : 200);
      }
      await request(app).delete(url).set(f.auth).expect(400);
      await request(app)
        .post(`${path(f.id)}/participants`)
        .set(f.auth)
        .send({ name: "Late" })
        .expect(400);
      await request(app)
        .put(path(f.id))
        .set(f.auth)
        .send({ noMutualAssignments: true })
        .expect(400);
      await request(app)
        .put(path(f.id))
        .set(f.auth)
        .send({ minWishlistSuggestions: 2 })
        .expect(400);
      await request(app)
        .put(path(f.id))
        .set(f.auth)
        .send({ lockSuggestionsAfterDraw: !lock })
        .expect(400);
      await request(app)
        .put(path(f.id))
        .set(f.auth)
        .send({
          name: "Updated",
          description: "Updated",
          budget: 70,
          eventDate: "2099-12-25",
          noMutualAssignments: false,
          lockSuggestionsAfterDraw: lock,
          minWishlistSuggestions: 0,
        })
        .expect(200);
      await request(app)
        .post(`${url}/access/regenerate`)
        .set(f.auth)
        .send({})
        .expect(201);
      await validAssignments(f.id);
    },
  );
  it("locks archives but permits reading, rotation and complete deletion", async () => {
    const f = await fixture();
    await drawExchange(f.id);
    await updateExchange(f.id, { eventDate: "2020-01-01" });
    const url = `${path(f.id)}/participants/${f.members[0].participant.id}`;
    expect(
      (await request(app).get(path(f.id)).set(f.auth).expect(200)).body
        .isArchived,
    ).toBe(true);
    await request(app).get(`/api/p/${f.token}`).expect(200);
    await request(app)
      .put(path(f.id))
      .set(f.auth)
      .send({ name: "Locked" })
      .expect(400);
    await request(app)
      .put(url)
      .set(f.auth)
      .send({ note: "Locked" })
      .expect(400);
    await request(app)
      .put(`/api/p/${f.token}`)
      .send({ note: "Locked" })
      .expect(400);
    await request(app).delete(url).set(f.auth).expect(400);
    await request(app)
      .post(`${path(f.id)}/participants`)
      .set(f.auth)
      .send({ name: "Late" })
      .expect(400);
    await request(app)
      .post(`${path(f.id)}/draw`)
      .set(f.auth)
      .expect(400);
    await request(app)
      .post(`${path(f.id)}/draw/cancel`)
      .set(f.auth)
      .expect(400);
    await request(app)
      .post(`${path(f.id)}/exclusions`)
      .set(f.auth)
      .send({
        giverParticipantId: f.members[0].participant.id,
        receiverParticipantId: f.members[1].participant.id,
      })
      .expect(400);
    await request(app)
      .delete(`${path(f.id)}/exclusions/missing`)
      .set(f.auth)
      .expect(400);
    const link = await request(app)
      .post(`${url}/access/regenerate`)
      .set(f.auth)
      .send({})
      .expect(201);
    await request(app).get(`/api${link.body.accessLink}`).expect(200);
    await request(app).delete(path(f.id)).set(f.auth).expect(204);
  });
  it("validates organizer ownership before draw", async () => {
    const a = await fixture(),
      b = await fixture();
    await request(app)
      .put(path(a.id))
      .set(a.auth)
      .send({ organizerId: b.members[0].participant.id })
      .expect(400);
    await request(app)
      .put(path(a.id))
      .set(a.auth)
      .send({ organizerId: a.members[0].participant.id })
      .expect(200);
  });
  it("reports minimum participants, wishlist and impossible constraints", async () => {
    const small = await fixture({}, 2);
    await expect(drawExchange(small.id)).rejects.toMatchObject({
      details: { code: "DRAW_MIN_ACTIVE_PARTICIPANTS" },
    });
    const wish = await fixture({ minWishlistSuggestions: 2 });
    await expect(drawExchange(wish.id)).rejects.toMatchObject({
      details: { code: "DRAW_MIN_WISHLIST_SUGGESTIONS" },
    });
    const f = await fixture();
    for (const member of f.members.slice(1))
      await createExclusionRule(f.id, {
        giverParticipantId: f.members[0].participant.id,
        receiverParticipantId: member.participant.id,
      });
    await expect(drawExchange(f.id)).rejects.toMatchObject({
      details: { code: "DRAW_IMPOSSIBLE", hasExclusionRules: true },
    });
    expect(await assignmentRepository.findByExchangeId(f.id)).toHaveLength(0);
  });
  it("preserves fresh/stale optimistic updates on exchange and both participant routes", async () => {
    const f = await fixture();
    for (const url of [
      path(f.id),
      `${path(f.id)}/participants/${f.members[0].participant.id}`,
      `/api/p/${f.token}`,
    ]) {
      const self = url.includes("/api/p/");
      const before = await request(app)
        .get(url)
        .set(self ? {} : f.auth)
        .expect(200);
      const stamp = self
        ? before.body.participant.updatedAt
        : before.body.updatedAt;
      // Explicitly advance the stored timestamp so this does not depend on sub-millisecond scheduling.
      const table = url === path(f.id) ? "exchanges" : "participants";
      const id = table === "exchanges" ? f.id : f.members[0].participant.id;
      await query(
        `UPDATE ${table} SET updated_at=updated_at+interval '1 second' WHERE id=$1`,
        [id],
      );
      const payload =
        table === "exchanges" ? { budget: 42 } : { note: "Updated" };
      await request(app)
        .put(url)
        .set(self ? {} : f.auth)
        .send({ ...payload, expectedUpdatedAt: stamp })
        .expect(409);
      const fresh = await request(app)
        .get(url)
        .set(self ? {} : f.auth)
        .expect(200);
      await request(app)
        .put(url)
        .set(self ? {} : f.auth)
        .send({
          ...payload,
          expectedUpdatedAt: self
            ? fresh.body.participant.updatedAt
            : fresh.body.updatedAt,
        })
        .expect(200);
    }
  });
  it("normalizes participant token variants", async () => {
    const f = await fixture();
    await request(app)
      .get(`/api/p/${f.token.toLowerCase().replaceAll("-", "")}`)
      .expect(200);
  });
});

describe("Dates and archive boundaries", () => {
  it("maps PostgreSQL civil dates and timestamps explicitly", async () => {
    const f = await fixture({ eventDate: "2099-12-25" });
    const exchange = await exchangeRepository.findById(f.id);
    expect(exchange?.eventDate).toBe("2099-12-25");
    expect(exchange?.createdAt).toMatch(/Z$/);
    expect(exchange?.updatedAt).toMatch(/Z$/);
    expect(
      (await participantRepository.findByExchangeId(f.id))[0].createdAt,
    ).toMatch(/Z$/);
    const updated = await updateExchange(f.id, { eventDate: "2099-12-24" });
    expect(updated.eventDate).toBe("2099-12-24");
  });
  it.each(["2026-02-29", "2026-13-01", "2026-04-31", "0000-01-01"])(
    "rejects invalid calendar date %s on create and update",
    async (date) => {
      await request(app)
        .post("/api/exchanges")
        .send({ name: "Date", adminPassword: password, eventDate: date })
        .expect(400);
      const f = await fixture();
      await request(app)
        .put(path(f.id))
        .set(f.auth)
        .send({ eventDate: date })
        .expect(400);
    },
  );
  it.each([
    ["2026-02-10", "2026-03-13T04:00:00.000Z"],
    ["2026-10-10", "2026-11-10T05:00:00.000Z"],
  ])("uses calendar days across DST from %s", (day, expected) => {
    const boundary = archiveAt(day);
    expect(new Date(boundary).toISOString()).toBe(expected);
    expect(isExchangeArchived({ eventDate: day }, boundary - 1)).toBe(false);
    expect(isExchangeArchived({ eventDate: day }, boundary)).toBe(true);
    expect(isExchangeArchived({}, boundary)).toBe(false);
  });
  it("validates configured timezone and uses it independently of host timezone", () => {
    process.env.EXCHANGE_TIME_ZONE = "UTC";
    expect(new Date(archiveAt("2026-02-10")).toISOString()).toBe(
      "2026-03-13T00:00:00.000Z",
    );
    process.env.EXCHANGE_TIME_ZONE = "invalid";
    expect(getExchangeTimeZone).toThrow("EXCHANGE_TIME_ZONE");
  });
});

describe("Additional contract regressions", () => {
  it("supports profile CRUD before draw and rejects invalid payloads", async () => {
    const f = await fixture({}, 1),
      id = f.members[0].participant.id;
    const url = `${path(f.id)}/participants/${id}`;
    await request(app)
      .put(url)
      .set(f.auth)
      .send({
        name: "Edited",
        email: "edited@example.com",
        note: "Edited",
        wishlist: [{ title: "Edited" }],
      })
      .expect(200);
    const read = await request(app).get(url).set(f.auth).expect(200);
    expect(read.body.name).toBe("Edited");
    await request(app)
      .put(`/api/p/${f.token}`)
      .send({ name: "Self edited", email: "self@example.com" })
      .expect(200);
    await request(app)
      .post(`${path(f.id)}/participants`)
      .set(f.auth)
      .send({ name: "" })
      .expect(400);
    await request(app)
      .post("/api/exchanges")
      .send({ name: "Invalid", adminPassword: "short" })
      .expect(400);
    await request(app).delete(url).set(f.auth).expect(204);
    await request(app).get(url).set(f.auth).expect(404);
    await request(app).get(`/api/p/${f.token}`).expect(404);
  });
  it("validates exclusions and locks deletion after draw", async () => {
    const f = await fixture(),
      b = await fixture();
    const giver = f.members[0].participant.id,
      receiver = f.members[1].participant.id;
    const post = (r: string) =>
      request(app)
        .post(`${path(f.id)}/exclusions`)
        .set(f.auth)
        .send({ giverParticipantId: giver, receiverParticipantId: r });
    await post(giver).expect(400);
    await post(b.members[0].participant.id).expect(400);
    const rule = await post(receiver).expect(201);
    await post(receiver).expect(400);
    await drawExchange(f.id);
    await validAssignments(f.id);
    await post(f.members[2].participant.id).expect(400);
    await request(app)
      .delete(`${path(f.id)}/exclusions/${rule.body.id}`)
      .set(f.auth)
      .expect(400);
    await cancelExchangeDraw(f.id);
    await request(app)
      .delete(`${path(f.id)}/exclusions/missing`)
      .set(f.auth)
      .expect(404);
    await request(app)
      .delete(`${path(f.id)}/exclusions/${rule.body.id}`)
      .set(f.auth)
      .expect(204);
  });
  it("rolls back a draw whose final exchange update fails", async () => {
    const f = await fixture();
    jest
      .spyOn(exchangeRepository, "update")
      .mockRejectedValueOnce(new Error("injected"));
    await expect(drawExchange(f.id)).rejects.toThrow("injected");
    expect(await assignmentRepository.findByExchangeId(f.id)).toHaveLength(0);
    expect((await exchangeRepository.findById(f.id))?.drawAt).toBeUndefined();
  });
  it("rolls back cancellation if drawAt cannot be cleared", async () => {
    const f = await fixture();
    await drawExchange(f.id);
    const before = await assignmentRepository.findByExchangeId(f.id);
    jest
      .spyOn(exchangeRepository, "update")
      .mockRejectedValueOnce(new Error("injected"));
    await expect(cancelExchangeDraw(f.id)).rejects.toThrow("injected");
    expect(await assignmentRepository.findByExchangeId(f.id)).toEqual(before);
    expect((await exchangeRepository.findById(f.id))?.drawAt).toBeDefined();
  });
  it("serializes deletion of an exchange against a draw", async () => {
    const f = await fixture();
    const result = await heldDraw(f.id, async () => {
      const response = await request(app).delete(path(f.id)).set(f.auth);
      expect(response.status).toBe(204);
    });
    expect(result.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await exchangeRepository.findById(f.id)).toBeUndefined();
    expect(await assignmentRepository.findByExchangeId(f.id)).toHaveLength(0);
  });
  it("serializes replacing rotations against a draw", async () => {
    const f = await fixture();
    const result = await heldDraw(f.id, () =>
      regenerateParticipantAccess(f.id, f.members[0].participant.id),
    );
    expect(result.every((r) => r.status === "fulfilled")).toBe(true);
    await request(app).get(`/api/p/${f.token}`).expect(404);
    await validAssignments(f.id);
  });
  it("locks unchanged structured suggestions by value rather than object key order", async () => {
    const f = await fixture();
    await drawExchange(f.id);
    await request(app)
      .put(`/api/p/${f.token}`)
      .send({ wishlist: [{ title: "Gift" }], note: "Private note" })
      .expect(200);
  });
  it("keeps version timestamps monotonic for queued optimistic updates", async () => {
    const f = await fixture(),
      current = await exchangeRepository.findById(f.id);
    const results = await Promise.allSettled([
      updateExchange(f.id, {
        budget: 1,
        expectedUpdatedAt: current?.updatedAt,
      }),
      updateExchange(f.id, {
        budget: 2,
        expectedUpdatedAt: current?.updatedAt,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("keeps auth login, password change and logout working", async () => {
    const f = await fixture();
    await request(app)
      .post(`${path(f.id)}/admin/sessions`)
      .send({ adminPassword: "wrongpassword" })
      .expect(400);
    const session = await request(app)
      .post(`${path(f.id)}/admin/sessions`)
      .send({ adminPassword: password })
      .expect(201);
    const auth = { authorization: `Bearer ${session.body.adminSessionToken}` };
    await request(app)
      .put(`${path(f.id)}/admin/password`)
      .set(auth)
      .send({ currentPassword: password, newPassword: "newpassword123" })
      .expect(204);
    await request(app)
      .post(`${path(f.id)}/admin/sessions`)
      .send({ adminPassword: password })
      .expect(400);
    await request(app)
      .post(`${path(f.id)}/admin/sessions`)
      .send({ adminPassword: "newpassword123" })
      .expect(201);
    await request(app)
      .delete(`${path(f.id)}/admin/sessions/current`)
      .set(auth)
      .expect(204);
    await request(app).get(path(f.id)).set(auth).expect(401);
  });
  it("normalizes timestamps on auth, access, assignments and exclusions", async () => {
    const f = await fixture();
    const rule = await createExclusionRule(f.id, {
      giverParticipantId: f.members[0].participant.id,
      receiverParticipantId: f.members[1].participant.id,
    });
    expect(rule.createdAt).toMatch(/Z$/);
    await drawExchange(f.id);
    expect(
      (await assignmentRepository.findByExchangeId(f.id))[0].createdAt,
    ).toMatch(/Z$/);
    const hash = (
      await query(
        "SELECT token_hash FROM admin_sessions WHERE exchange_id=$1",
        [f.id],
      )
    ).rows[0].token_hash;
    const session = await exchangeRepository.findAdminSessionByTokenHash(hash);
    expect(session?.createdAt).toMatch(/Z$/);
    expect(session?.expiresAt).toMatch(/Z$/);
  });
});

describe("Organizer reference integrity", () => {
  it("returns the committed version on creation and clears a deleted organizer reference before draw", async () => {
    const created = await createExchange({
      name: "Organizer",
      organizerName: "Organizer",
      adminPassword: password,
    });
    expect(created.exchange.updatedAt).toBe(
      (await exchangeRepository.findById(created.exchange.id))?.updatedAt,
    );
    await deleteParticipant(created.exchange.id, created.exchange.organizerId);
    expect(
      (await exchangeRepository.findById(created.exchange.id))?.organizerId,
    ).toBe("");
  });
});
