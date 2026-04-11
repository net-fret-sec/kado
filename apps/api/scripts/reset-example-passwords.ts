import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { getPool, closePool } from "../src/db";
import { hashPassword } from "../src/lib/crypto";

type TestDataShape = {
  exchanges?: Array<{ id: string }>;
};

const DEFAULT_PASSWORD = "Qwerty12345!";

async function loadExampleExchangeIdsFromTestData(): Promise<string[]> {
  const filePath = path.resolve(process.cwd(), "src/test-data.json");
  const content = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as TestDataShape;

  const ids = (parsed.exchanges ?? [])
    .map((exchange) => exchange.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return Array.from(new Set(ids));
}

async function loadAllExchangeIdsWithAdminAccess(): Promise<string[]> {
  const result = await getPool().query<{ exchange_id: string }>(
    `
      SELECT exchange_id
      FROM admin_access
      ORDER BY exchange_id ASC
    `,
  );

  return result.rows.map((row) => row.exchange_id);
}

async function run() {
  const password = process.env.EXAMPLE_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const target = (process.env.EXAMPLE_PASSWORD_TARGET || "test-data").toLowerCase();

  const exchangeIds =
    target === "all"
      ? await loadAllExchangeIdsWithAdminAccess()
      : await loadExampleExchangeIdsFromTestData();

  if (exchangeIds.length === 0) {
    console.log("No example exchanges found. Nothing to update.");
    return;
  }

  const newPasswordHash = hashPassword(password);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const updateResult = await client.query(
      `
        UPDATE admin_access
        SET password_hash = $1, updated_at = NOW()
        WHERE exchange_id = ANY($2::text[])
      `,
      [newPasswordHash, exchangeIds],
    );

    const sessionDeleteResult = await client.query(
      `
        DELETE FROM admin_sessions
        WHERE exchange_id = ANY($1::text[])
      `,
      [exchangeIds],
    );

    await client.query("COMMIT");

    console.log(
      `Updated ${updateResult.rowCount ?? 0} admin password(s) for ${exchangeIds.length} exchange(s).`,
    );
    console.log(
      `Revoked ${sessionDeleteResult.rowCount ?? 0} existing admin session(s).`,
    );
    console.log("Shared test password applied successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    const message =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error("Failed to reset example passwords:\n", message);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
