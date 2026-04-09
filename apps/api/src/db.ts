import { Pool, type PoolClient, type QueryResultRow } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim();

let pool: Pool | null = null;

export type DbExecutor = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export function isDatabaseConfigured(): boolean {
  return Boolean(DATABASE_URL);
}

export function getPool(): Pool {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 3_000,
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
  db: DbExecutor = getPool(),
) {
  return db.query<T>(text, values);
}

export async function withTransaction<T>(
  operation: (db: DbExecutor) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth() {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      ok: false,
      error: "DATABASE_URL is not configured.",
    };
  }

  try {
    await query("SELECT 1");
    return {
      configured: true,
      ok: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return {
      configured: true,
      ok: false,
      error: message,
    };
  }
}

export async function closePool() {
  if (!pool) return;

  await pool.end();
  pool = null;
}
