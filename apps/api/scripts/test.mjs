import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
const name = `kado-p0-test-${randomUUID()}`;
const database = `kado_test_${randomUUID().replaceAll("-", "")}`;
const password = randomUUID();
let started = false;
let pool;
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0)
    throw new Error(result.stderr || result.error?.message || "Docker failed");
  return result.stdout.trim();
}
try {
  docker([
    "run",
    "-d",
    "--name",
    name,
    "-e",
    `POSTGRES_DB=${database}`,
    "-e",
    "POSTGRES_USER=kado_test",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-p",
    "127.0.0.1::5432",
    "postgres:16-alpine",
  ]);
  started = true;
  const port = docker([
    "inspect",
    "--format",
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    name,
  ]);
  const url = `postgresql://kado_test:${password}@127.0.0.1:${port}/${database}`;
  pool = new Pool({ connectionString: url, connectionTimeoutMillis: 1000 });
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      await pool.query("SELECT 1");
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  for (const file of (await readdir(`${root}migrations`))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pool.query(await readFile(`${root}migrations/${file}`, "utf8"));
  }
  await pool.end();
  pool = undefined;
  console.log("Running API tests against a disposable PostgreSQL 16 database.");
  const result = spawnSync(
    "pnpm",
    ["exec", "jest", "--runInBand", ...process.argv.slice(2)],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: url,
        KADO_TEST_DATABASE_URL: url,
        EXCHANGE_TIME_ZONE: "America/Toronto",
      },
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (pool) await pool.end();
  if (started) docker(["rm", "-f", name]);
}
