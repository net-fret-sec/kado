import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { closePool, getPool } from "../src/db";

const REQUIRED_CONFIRMATION = "RESET_DB";
const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

function assertConfirmation() {
  const confirmation = (process.env.RESET_DB_CONFIRM ?? "").trim();
  if (confirmation === REQUIRED_CONFIRMATION) {
    return;
  }

  console.error(
    [
      "Refusing to reset the whole database schema without explicit confirmation.",
      `Run with RESET_DB_CONFIRM=${REQUIRED_CONFIRMATION}`,
      "Example:",
      `RESET_DB_CONFIRM=${REQUIRED_CONFIRMATION} pnpm db:reset-db:api`,
    ].join("\n"),
  );
  process.exit(1);
}

async function recreatePublicSchema() {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureMigrationsTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigration(filename: string, sql: string) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      filename,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  await ensureMigrationsTable();

  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const filename of files) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(filePath, "utf-8");

    console.log(`Applying migration ${filename}...`);
    await applyMigration(filename, sql);
  }
}

async function run() {
  assertConfirmation();
  await recreatePublicSchema();
  await runMigrations();
  console.log("Database schema reset completed.");
}

run()
  .catch((error) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("Failed to reset database schema:\n", message);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
