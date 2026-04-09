import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { getPool } from "../src/db";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

async function ensureMigrationsTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await getPool().query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY id ASC",
  );

  return new Set(result.rows.map((row) => row.filename));
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

async function run() {
  await ensureMigrationsTable();

  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const applied = await getAppliedMigrations();

  if (files.length === 0) {
    console.log("No migration files found.");
    return;
  }

  let appliedCount = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql = await fs.readFile(filePath, "utf-8");

    console.log(`Applying migration ${filename}...`);
    await applyMigration(filename, sql);
    appliedCount += 1;
  }

  if (appliedCount === 0) {
    console.log("Migrations are already up to date.");
    return;
  }

  console.log(`Applied ${appliedCount} migration(s).`);
}

run().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("Migration failed:\n", message);
  process.exit(1);
});
