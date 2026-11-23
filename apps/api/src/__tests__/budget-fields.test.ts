import request from "supertest";
import { createApp } from "../app";
import { query, closePool } from "../db";
import { createExchange, drawExchange } from "../services/exchange.service";
import { createParticipantWithAccess } from "./participant-fixture";

const app = createApp();
beforeEach(async () => { await query("TRUNCATE exchanges CASCADE"); });
afterAll(closePool);
async function fixture() {
  const created = await createExchange({ name: "Fields", adminPassword: "password123", budget: 25, description: "Description", eventDate: "2099-12-25", plannedDrawDate: "2099-12-01" });
  return { id: created.exchange.id, url: `/api/exchanges/${created.exchange.id}`, auth: { authorization: `Bearer ${created.adminSessionToken}` } };
}
it("distinguishes omitted budget, explicit clearing, zero and integer boundaries", async () => {
  const f = await fixture();
  expect((await request(app).put(f.url).set(f.auth).send({ name: "Renamed" }).expect(200)).body.budget).toBe(25);
  for (const budget of [null, 0, 1, 1000, null]) {
    const response = await request(app).put(f.url).set(f.auth).send({ budget }).expect(200);
    expect(response.body.budget).toBe(budget ?? undefined);
    expect((await request(app).get(f.url).set(f.auth).expect(200)).body.budget).toBe(budget ?? undefined);
    expect(response.body.description).toBe("Description");
  }
});
it("rejects invalid creation and update budgets without altering stored data", async () => {
  const f = await fixture();
  for (const budget of [-1, 0.01, 25.999, 1001, 99999999.99, 99999999.999, 100000000, "25", ""]) {
    await request(app).post('/api/exchanges').send({ name: "Invalid", adminPassword: "password123", budget }).expect(400);
    const invalid = await request(app).put(f.url).set(f.auth).send({ budget, description: "Must not save" }).expect(400);
    expect(invalid.body.error.details.fieldErrors.budget).toBeDefined();
    const current = (await request(app).get(f.url).set(f.auth).expect(200)).body;
    expect(current.budget).toBe(25);
    expect(current.description).toBe("Description");
  }
});
it("preserves legacy budgets when omitted or unchanged, and allows correction or removal", async () => {
  const f = await fixture();
  for (const legacy of [25.75, 1500, 99999999.99]) {
    await query("UPDATE exchanges SET budget=$2 WHERE id=$1", [f.id, legacy]);
    expect((await request(app).put(f.url).set(f.auth).send({ description: "Edited" }).expect(200)).body.budget).toBe(legacy);
    expect((await request(app).put(f.url).set(f.auth).send({ budget: legacy, description: "Again" }).expect(200)).body.budget).toBe(legacy);
    await request(app).put(f.url).set(f.auth).send({ budget: legacy + 0.01 }).expect(400);
    expect((await request(app).put(f.url).set(f.auth).send({ budget: 1000 }).expect(200)).body.budget).toBe(1000);
    await query("UPDATE exchanges SET budget=$2 WHERE id=$1", [f.id, legacy]);
    expect((await request(app).put(f.url).set(f.auth).send({ budget: null }).expect(200)).body.budget).toBeUndefined();
  }
});
it("clears optional text and dates, preserves omitted fields and rejects stale updates", async () => {
  const f = await fixture();
  const old = (await request(app).get(f.url).set(f.auth).expect(200)).body;
  await request(app).put(f.url).set(f.auth).send({ description: "", eventDate: null, plannedDrawDate: "", budget: null, expectedUpdatedAt: old.updatedAt }).expect(200);
  const current = (await request(app).get(f.url).set(f.auth).expect(200)).body;
  for (const field of ['description', 'eventDate', 'plannedDrawDate', 'budget']) expect(current[field]).toBeUndefined();
  await request(app).put(f.url).set(f.auth).send({ budget: 50, expectedUpdatedAt: old.updatedAt }).expect(409);
  expect((await request(app).get(f.url).set(f.auth).expect(200)).body.budget).toBeUndefined();
  const member = await createParticipantWithAccess(f.id, { name: "Alex", note: "Note" });
  const url = `${f.url}/participants/${member.participant.id}`;
  await request(app).put(url).set(f.auth).send({ name: "Alex 2" }).expect(200);
  expect((await request(app).get(`/api${member.accessLink}`).expect(200)).body.participant.note).toBe("Note");
  await request(app).put(url).set(f.auth).send({ note: "" }).expect(200);
  expect((await request(app).get(`/api${member.accessLink}`).expect(200)).body.participant.note).toBeUndefined();
  await request(app).put(`/api${member.accessLink}`).send({ note: "Again" }).expect(200);
  await request(app).put(`/api${member.accessLink}`).send({ note: "" }).expect(200);
  expect((await request(app).get(url).set(f.auth).expect(200)).body.note).toBeUndefined();
});
it("keeps draw and archive restrictions while permitting allowed budget edits", async () => {
  const f = await fixture();
  const members = [];
  for (const name of ['Alex', 'Blair', 'Casey']) members.push(await createParticipantWithAccess(f.id, { name, note: "Keep" }));
  await drawExchange(f.id);
  await request(app).put(f.url).set(f.auth).send({ budget: 0 }).expect(200);
  await request(app).put(`/api${members[0].accessLink}`).send({ note: "" }).expect(400);
  await query("UPDATE exchanges SET event_date=CURRENT_DATE-40 WHERE id=$1", [f.id]);
  await request(app).put(f.url).set(f.auth).send({ budget: null, description: "" }).expect(400);
  expect((await request(app).get(f.url).set(f.auth).expect(200)).body.budget).toBe(0);
});
