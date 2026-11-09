import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const build = spawn("pnpm", ["--dir", "apps/monitor", "build"], {
  cwd: root,
  stdio: "inherit",
});
build.on("error", () => {
  console.error("Impossible de lancer pnpm.");
  process.exitCode = 1;
});
build.on("exit", (code) => {
  if (code !== 0) {
    process.exitCode = code || 1;
    return;
  }
  const child = spawn(process.execPath, ["apps/monitor/server.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
});
