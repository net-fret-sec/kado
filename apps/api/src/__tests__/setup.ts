// Loaded before app imports. Refuse accidental execution on a development database.
const url = process.env.KADO_TEST_DATABASE_URL;
if (!url || process.env.DATABASE_URL !== url) {
  throw new Error(
    "Run pnpm test: tests require a disposable KADO_TEST_DATABASE_URL.",
  );
}
const parsed = new URL(url);
if (
  parsed.hostname !== "127.0.0.1" ||
  !/^\/kado_test_[a-f0-9]+$/.test(parsed.pathname)
) {
  throw new Error("Unsafe test database URL.");
}
process.env.PARTICIPANT_ACCESS_BASE_DELAY_MS = "1";
process.env.PARTICIPANT_ACCESS_MAX_DELAY_MS = "2";
