import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "../.."),
  dir = await mkdtemp(path.join(tmpdir(), "kado-ops-test-"));
try {
  await mkdir(path.join(dir, "bin"));
  const envFile = path.join(dir, "env");
  await writeFile(
    envFile,
    "POSTGRES_DB=kado_test\nPOSTGRES_USER=kado_test\nPOSTGRES_PASSWORD=test\nDOMAIN=http://test\nACME_EMAIL=test@example.com\n",
  );
  const trace = path.join(dir, "trace");
  await writeFile(
    path.join(dir, "bin/docker"),
    `#!/usr/bin/env bash
set -eu
echo "$*" >> "$TRACE"
if [[ "$*" == *pg_dump* ]]; then [[ "\${FAIL:-}" != dump ]] || exit 1; printf valid-dump;
elif [[ "$*" == *pg_restore* ]]; then cat >/dev/null; [[ "\${FAIL:-}" != validate ]] || exit 1;
elif [[ "$*" == *dist/migrate.cjs* && "\${FAIL:-}" == migrate ]]; then exit 1;
elif [[ "$*" == *"up -d --wait --wait-timeout 90 api caddy"* && "\${FAIL:-}" == start ]]; then exit 1;
elif [[ "$*" == *"ps -a -q db"* ]]; then echo existing-db; fi
`,
    { mode: 0o700 },
  );
  const env = {
    ...process.env,
    PATH: path.join(dir, "bin") + ":" + process.env.PATH,
    TRACE: trace,
    KADO_OPERATION_LOCK: path.join(dir, "lock"),
  };
  const invoke = (script, args, more = {}) =>
    spawnSync(
      "bash",
      [path.join(root, "deploy/scripts", script), envFile, ...args],
      { cwd: root, env: { ...env, ...more }, encoding: "utf8" },
    );
  const backup = path.join(dir, "backup");
  await mkdir(backup);
  env.KADO_BACKUP_DIR = backup;
  const sentinel = path.join(backup, "kado-20000101T040000-old.dump");
  await writeFile(sentinel, "old");
  assert.notEqual(invoke("backup-db.sh", [backup], { FAIL: "dump" }).status, 0);
  assert.equal(await readFile(sentinel, "utf8"), "old");
  assert.notEqual(
    invoke("backup-db.sh", [backup], { FAIL: "validate" }).status,
    0,
  );
  assert.equal(invoke("backup-db.sh", [backup]).status, 0);
  const bundle = path.join(dir, "bundle");
  await mkdir(bundle);
  await writeFile(path.join(bundle, "version"), "a".repeat(40));
  await writeFile(path.join(bundle, "images.tar.gz"), "fake");
  const sums = spawnSync("sha256sum", ["images.tar.gz", "version"], {
    cwd: bundle,
    encoding: "utf8",
  }).stdout;
  await writeFile(path.join(bundle, "SHA256SUMS"), sums);
  assert.notEqual(
    invoke("release.sh", [bundle], { FAIL: "migrate" }).status,
    0,
  );
  const log = await readFile(trace, "utf8");
  assert(!log.includes("up -d --wait --wait-timeout 90 api caddy"));
  assert(!log.includes("dropdb"));
  await writeFile(trace, "");
  assert.notEqual(invoke("release.sh", [bundle], { FAIL: "start" }).status, 0);
  assert(!(await readFile(trace, "utf8")).includes("dropdb"));
  await writeFile(trace, "");
  await writeFile(path.join(bundle, "images.tar.gz"), "tampered");
  assert.notEqual(invoke("release.sh", [bundle]).status, 0);
  assert.equal(await readFile(trace, "utf8"), "");
  console.log(
    "Operations: failed dumps, verification and migrations abort safely; tampered release rejected.",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
