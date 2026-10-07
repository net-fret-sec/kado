import { getConfig } from "./lib/config";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim();

let pool: Pool | null = null;

export type DbExecutor = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export function isDatabaseConfigured(): boolean {
  return Boolean(
    DATABASE_URL ||
    (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER),
  );
}

export function getPool(): Pool {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      statement_timeout: getConfig().queryTimeout,
      query_timeout: getConfig().queryTimeout,
      lock_timeout: getConfig().lockTimeout,
    });
    pool.on("error", () =>
      console.error(JSON.stringify({ event: "database_pool_error" })),
    );
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

  let destroyed = false;
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      destroyed = true;
      client.release(true);
      throw error;
    }
    throw error;
  } finally {
    if (!destroyed) client.release();
  }
}

export async function checkDatabaseHealth() {
  if (!isDatabaseConfigured()) return { configured: false, ok: false };
  const start = Date.now();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connection = getPool().connect();
  let client: PoolClient | undefined;
  try {
    client = await Promise.race([
      connection,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("timeout"));
        }, 1900);
      }),
    ]);
    if (timer) clearTimeout(timer);
    const remaining = Math.max(1, 1900 - (Date.now() - start));
    await Promise.race([
      client.query("SELECT 1"),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("timeout"));
        }, remaining);
      }),
    ]);
    return { configured: true, ok: true };
  } catch {
    return { configured: true, ok: false };
  } finally {
    if (timer) clearTimeout(timer);
    if (client) client.release(expired);
    else if (expired) void connection.then((c) => c.release()).catch(() => {});
  }
}

export async function closePool() {
  if (!pool) return;

  await pool.end();
  pool = null;
}
