import { closePool, getPool, query } from "../db";
import { getConfig } from "../lib/config";
import {
  cleanupExpiredExchanges,
  runExchangeCleanup,
} from "../services/exchange-retention.service";
import {
  createExchange,
  drawExchange,
  getExchangeById,
} from "../services/exchange.service";
import {
  createParticipant,
  getParticipantSelfViewByToken,
} from "../services/participant.service";
import { createExclusionRule } from "../services/exclusion-rule.service";

const retentionVariables = [
  "EXCHANGE_RETENTION_AFTER_EVENT_MONTHS",
  "EXCHANGE_RETENTION_WITHOUT_EVENT_MONTHS",
] as const;

beforeEach(async () => {
  jest.restoreAllMocks();
  for (const name of retentionVariables) delete process.env[name];
  process.env.EXCHANGE_TIME_ZONE = "America/Toronto";
  await query("TRUNCATE exchanges CASCADE");
});
afterAll(closePool);

async function insert(
  id: string,
  eventDate: string | null,
  createdAt = "2000-01-01T12:00:00Z",
) {
  await query(
    `INSERT INTO exchanges (id, name, organizer_id, event_date, created_at)
     VALUES ($1, 'Retention fixture', '', $2, $3)`,
    [id, eventDate, createdAt],
  );
}
async function remaining() {
  return (
    await query<{ id: string }>("SELECT id FROM exchanges ORDER BY id")
  ).rows.map((r) => r.id);
}

it("defaults to three and six months and accepts independent overrides", () => {
  expect(getConfig().exchangeRetention).toEqual({
    afterEventMonths: 3,
    withoutEventMonths: 6,
    timeZone: "America/Toronto",
  });
  process.env.EXCHANGE_RETENTION_AFTER_EVENT_MONTHS = "2";
  process.env.EXCHANGE_RETENTION_WITHOUT_EVENT_MONTHS = "9";
  expect(getConfig().exchangeRetention).toMatchObject({
    afterEventMonths: 2,
    withoutEventMonths: 9,
  });
});

it.each(retentionVariables)("rejects unsafe values for %s", (name) => {
  for (const value of ["", "0", "-1", "1.5", "NaN", "1201"]) {
    process.env[name] = value;
    expect(getConfig).toThrow(`Invalid ${name}.`);
  }
});

it("uses the event date even for an old exchange and deletes at the exact local midnight boundary", async () => {
  await insert("due", "2026-08-15");
  await insert("future", "2026-12-25");
  expect(
    await cleanupExpiredExchanges(100, new Date("2026-11-15T04:59:59.999Z")),
  ).toBe(0);
  expect(
    await cleanupExpiredExchanges(100, new Date("2026-11-15T05:00:00Z")),
  ).toBe(1);
  expect(await remaining()).toEqual(["future"]);
});

it("keeps creation's local time across daylight saving changes when no event is set", async () => {
  await insert("undated", null, "2026-05-15T16:30:00Z");
  await query(
    "UPDATE exchanges SET planned_draw_date='2030-01-01', updated_at=NOW()",
  );
  expect(
    await cleanupExpiredExchanges(100, new Date("2026-11-15T17:29:59.999Z")),
  ).toBe(0);
  expect(
    await cleanupExpiredExchanges(100, new Date("2026-11-15T17:30:00Z")),
  ).toBe(1);
});

it.each([
  ["2026-01-31", "2000-01-01T12:00:00Z", "2026-04-30T04:00:00Z"],
  ["2023-11-30", "2000-01-01T12:00:00Z", "2024-02-29T05:00:00Z"],
  [null, "2026-08-31T04:00:00Z", "2027-02-28T05:00:00Z"],
  [null, "2023-08-31T04:00:00Z", "2024-02-29T05:00:00Z"],
])("clamps month-end dates (%s, %s)", async (event, created, expiry) => {
  await insert("month-end", event, created!);
  const boundary = new Date(expiry!);
  expect(
    await cleanupExpiredExchanges(100, new Date(boundary.getTime() - 1)),
  ).toBe(0);
  expect(await cleanupExpiredExchanges(100, boundary)).toBe(1);
});

it("uses the configured time zone instead of the database session time zone", async () => {
  process.env.EXCHANGE_TIME_ZONE = "Asia/Tokyo";
  await insert("tokyo", "2026-08-16");
  expect(
    await cleanupExpiredExchanges(100, new Date("2026-11-15T14:59:59.999Z")),
  ).toBe(0);
  expect(
    await cleanupExpiredExchanges(100, new Date("2026-11-15T15:00:00Z")),
  ).toBe(1);
});

it("applies current ENV values to existing exchanges without a migration", async () => {
  await insert("dated", "2026-08-15");
  await insert("undated", null, "2026-05-15T16:30:00Z");
  const now = new Date("2026-10-15T16:30:00Z");
  expect(await cleanupExpiredExchanges(100, now)).toBe(0);
  process.env.EXCHANGE_RETENTION_AFTER_EVENT_MONTHS = "2";
  process.env.EXCHANGE_RETENTION_WITHOUT_EVENT_MONTHS = "5";
  expect(await cleanupExpiredExchanges(100, now)).toBe(2);
});

it("recalculates when an event date is added, changed or removed", async () => {
  await insert("changed", null);
  await query(
    "UPDATE exchanges SET event_date='2030-12-25' WHERE id='changed'",
  );
  const now = new Date("2030-01-01T00:00:00Z");
  expect(await cleanupExpiredExchanges(100, now)).toBe(0);
  await query(
    "UPDATE exchanges SET event_date='2031-12-25' WHERE id='changed'",
  );
  expect(await cleanupExpiredExchanges(100, now)).toBe(0);
  await query("UPDATE exchanges SET event_date=NULL WHERE id='changed'");
  expect(await cleanupExpiredExchanges(100, now)).toBe(1);
});

it("cascades to all exchange data and invalidates participant access", async () => {
  const { exchange } = await createExchange({
    name: "Private exchange",
    adminPassword: "test-password",
  });
  const members = [];
  for (let i = 0; i < 3; i++)
    members.push(
      await createParticipant(exchange.id, {
        name: `Member ${i}`,
        wishlist: [{ title: "Gift" }],
      }),
    );
  await createExclusionRule(exchange.id, {
    giverParticipantId: members[0]!.participant.id,
    receiverParticipantId: members[1]!.participant.id,
  });
  await drawExchange(exchange.id);
  await query(
    "INSERT INTO suggestion_images (id, participant_id, content, width, height) VALUES ('retention-image', $1, $2, 1, 1)",
    [members[0]!.participant.id, Buffer.from("image")],
  );
  const tables = [
    "participants",
    "assignments",
    "exclusion_rules",
    "admin_access",
    "admin_sessions",
    "participant_access",
    "suggestion_images",
  ];
  for (const table of tables)
    expect(
      Number((await query(`SELECT count(*) FROM ${table}`)).rows[0].count),
    ).toBeGreaterThan(0);
  await query("UPDATE exchanges SET created_at='2000-01-01' WHERE id=$1", [
    exchange.id,
  ]);
  expect(await cleanupExpiredExchanges()).toBe(1);
  for (const table of tables)
    expect(
      Number((await query(`SELECT count(*) FROM ${table}`)).rows[0].count),
    ).toBe(0);
  await expect(getExchangeById(exchange.id)).rejects.toMatchObject({
    statusCode: 404,
  });
  const token = members[0]!.accessLink.split("/").pop()!;
  await expect(getParticipantSelfViewByToken(token)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(await cleanupExpiredExchanges()).toBe(0);
});

it.each(["COMMIT", "ROLLBACK"])(
  "skips locked exchanges and rechecks the date after %s",
  async (outcome) => {
    await insert("busy", "2020-01-01");
    await insert("free", null);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE exchanges SET event_date='2040-01-01' WHERE id='busy'",
      );
      const now = new Date("2030-01-01T00:00:00Z");
      expect(await cleanupExpiredExchanges(100, now)).toBe(1);
      expect(await remaining()).toEqual(["busy"]);
      await client.query(outcome);
      expect(await cleanupExpiredExchanges(100, now)).toBe(
        outcome === "COMMIT" ? 0 : 1,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  },
);

it("bounds concurrent batches and continues across cycles without duplicate deletions", async () => {
  await query(
    "INSERT INTO exchanges (id,name,organizer_id,created_at) SELECT 'old-' || n, 'Old', '', '2000-01-01'::timestamptz FROM generate_series(1,203) n",
  );
  const batches = await Promise.all([
    cleanupExpiredExchanges(),
    cleanupExpiredExchanges(),
  ]);
  expect(batches).toEqual([100, 100]);
  expect(await cleanupExpiredExchanges()).toBe(3);
  expect(await cleanupExpiredExchanges()).toBe(0);
});

it("drains a backlog and logs only a count", async () => {
  await query(
    "INSERT INTO exchanges (id,name,organizer_id,created_at) SELECT 'old-' || n, 'Private name', '', '2000-01-01'::timestamptz FROM generate_series(1,203) n",
  );
  const log = jest.spyOn(console, "info").mockImplementation(() => {});
  expect(await runExchangeCleanup()).toBe(203);
  expect(await remaining()).toEqual([]);
  expect(log).toHaveBeenCalledWith(
    JSON.stringify({ event: "exchange_cleanup_completed", deletedCount: 203 }),
  );
  expect(log).toHaveBeenCalledTimes(1);
});
