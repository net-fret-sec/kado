import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const tag = process.env.KADO_IMAGE_TAG ?? `p2-test-${randomUUID().slice(0, 8)}`;
function run(args, env = process.env) {
  const result = spawnSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit', env });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`Failed: ${args.slice(0, 3).join(' ')}`);
}
let built = false;
try {
  if (!process.env.KADO_IMAGE_TAG) {
    built = true;
    run(['docker', 'build', '-f', 'deploy/docker/api.Dockerfile', '-t', `kado-api:${tag}`, '.']);
    run(['docker', 'build', '-f', 'deploy/docker/caddy.Dockerfile', '-t', `kado-web:${tag}`, '.']);
  }
  run(['node', 'deploy/scripts/smoke.mjs'], { ...process.env, KADO_IMAGE_TAG: tag });
} finally {
  if (built) spawnSync('docker', ['image', 'rm', `kado-api:${tag}`, `kado-web:${tag}`], { cwd: root, stdio: 'inherit' });
}
