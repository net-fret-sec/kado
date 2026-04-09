import "dotenv/config";
import { checkDatabaseHealth, closePool } from "../src/db";

async function run() {
  const status = await checkDatabaseHealth();

  if (!status.configured) {
    console.error(
      "Database is not configured. Set DATABASE_URL in apps/api/.env.",
    );
    process.exit(1);
  }

  if (!status.ok) {
    console.error(`Database ping failed: ${status.error ?? "unknown error"}`);
    process.exit(1);
  }

  console.log("Database ping successful.");
}

run()
  .catch((error) => {
    console.error("Database ping failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
