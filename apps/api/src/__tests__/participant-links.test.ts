import request from "supertest";
import { createApp } from "../app";
import { query, closePool } from "../db";
import { createExchange } from "../services/exchange.service";
import {
  createParticipant,
  regenerateParticipantAccess,
} from "../services/participant.service";

const app = createApp();
beforeEach(async () => {
  await query("TRUNCATE exchanges CASCADE");
});
afterAll(closePool);

it("creates participants, including the organizer, without access and preserves the state on reads and edits", async () => {
  const { exchange, adminSessionToken } = await createExchange({
    name: "Links",
    adminPassword: "testpassword123",
    organizerName: "Alex",
    organizerParticipates: true,
  });
  const base = `/api/exchanges/${exchange.id}`;
  const auth = { authorization: `Bearer ${adminSessionToken}` };
  const added = await request(app)
    .post(`${base}/participants`)
    .set(auth)
    .send({ name: "Blair" })
    .expect(201);
  expect(added.body.accessLink).toBeUndefined();
  expect(added.body.participant.hasGeneratedAccess).toBe(false);
  expect(
    (await query("SELECT count(*) FROM participant_access")).rows[0].count,
  ).toBe("0");
  const list = await request(app)
    .get(`${base}/participants`)
    .set(auth)
    .expect(200);
  expect(list.body).toHaveLength(2);
  expect(
    list.body.every(
      (p: { hasGeneratedAccess: boolean }) => p.hasGeneratedAccess === false,
    ),
  ).toBe(true);
  const url = `${base}/participants/${added.body.participant.id}`;
  const edited = await request(app)
    .put(url)
    .set(auth)
    .send({ name: "Blair 2" })
    .expect(200);
  expect(edited.body.hasGeneratedAccess).toBe(false);
  const first = await request(app)
    .post(`${url}/access/regenerate`)
    .set(auth)
    .send({ expectedAccessGenerated: false })
    .expect(201);
  await request(app).get(`/api${first.body.accessLink}`).expect(200);
  expect(
    (await request(app).get(url).set(auth).expect(200)).body.hasGeneratedAccess,
  ).toBe(true);
  expect(
    (await request(app).put(url).set(auth).send({ note: "hello" }).expect(200))
      .body.hasGeneratedAccess,
  ).toBe(true);
  // A stale tab must never silently invalidate the link just generated elsewhere.
  await request(app)
    .post(`${url}/access/regenerate`)
    .set(auth)
    .send({ expectedAccessGenerated: false })
    .expect(409);
  await request(app).get(`/api${first.body.accessLink}`).expect(200);
  const rotated = await request(app)
    .post(`${url}/access/regenerate`)
    .set(auth)
    .send({ expectedAccessGenerated: true })
    .expect(201);
  await request(app).get(`/api${first.body.accessLink}`).expect(404);
  await request(app).get(`/api${rotated.body.accessLink}`).expect(200);
  // An older caller without the new precondition remains supported.
  const legacy = await request(app)
    .post(`${url}/access/regenerate`)
    .set(auth)
    .send({})
    .expect(201);
  await request(app).get(`/api${legacy.body.accessLink}`).expect(200);
  const another = await request(app)
    .post(`${base}/participants`)
    .set(auth)
    .send({ name: "Casey" })
    .expect(201);
  expect(another.body.participant.hasGeneratedAccess).toBe(false);
  await request(app).get(`/api${legacy.body.accessLink}`).expect(200);
  await query("UPDATE participant_access SET status = 'revoked'");
  expect(
    (await request(app).get(url).set(auth).expect(200)).body.hasGeneratedAccess,
  ).toBe(true);
});

it("serializes competing first generations so only one link is issued", async () => {
  const { exchange } = await createExchange({
    name: "Concurrent",
    adminPassword: "testpassword123",
  });
  const { participant } = await createParticipant(exchange.id, {
    name: "Alex",
  });
  const results = await Promise.allSettled([
    regenerateParticipantAccess(exchange.id, participant.id, true, false),
    regenerateParticipantAccess(exchange.id, participant.id, true, false),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    (await query("SELECT count(*) FROM participant_access")).rows[0].count,
  ).toBe("1");
});
