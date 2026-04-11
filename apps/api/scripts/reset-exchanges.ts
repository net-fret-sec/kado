import "dotenv/config";
import { getPool, closePool } from "../src/db";

const REQUIRED_CONFIRMATION = "RESET_EXCHANGES";

function assertConfirmation() {
  const confirmation = (process.env.RESET_EXCHANGES_CONFIRM ?? "").trim();
  if (confirmation === REQUIRED_CONFIRMATION) {
    return;
  }

  console.error(
    [
      "Refusing to delete all exchanges without explicit confirmation.",
      `Run with RESET_EXCHANGES_CONFIRM=${REQUIRED_CONFIRMATION}`,
      "Example:",
      `RESET_EXCHANGES_CONFIRM=${REQUIRED_CONFIRMATION} pnpm db:reset-exchanges:api`,
    ].join("\n"),
  );
  process.exit(1);
}

async function run() {
  assertConfirmation();

  const result = await getPool().query("DELETE FROM exchanges");
  const deleted = result.rowCount ?? 0;

  // Related rows are deleted automatically through ON DELETE CASCADE.
  console.log(`Deleted ${deleted} exchange(s).`);
  console.log("Database reset for exchanges completed.");
}

run()
  .catch((error) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("Failed to reset exchanges:\n", message);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
