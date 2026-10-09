import "dotenv/config";
import { createApp } from "./app";
import { getConfig } from "./lib/config";
import { localAdminToolsEnabled } from "./lib/local-admin-tools";
import { checkDatabaseHealth, closePool } from "./db";
import { stopImageWorker } from "./image-worker";
import { runImageCleanup } from "./services/image.service";
import { stopDrawWorker } from "./draw-worker";
async function bootstrap() {
  const config = getConfig();
  if (!(await checkDatabaseHealth()).ok)
    throw new Error("Database is not ready.");
  await runImageCleanup();
  let cleaning = false;
  const cleanup = setInterval(async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      await runImageCleanup();
    } catch {
      console.error(JSON.stringify({ event: "image_cleanup_failed" }));
    } finally {
      cleaning = false;
    }
  }, 3600000);
  cleanup.unref();
  const server = createApp().listen(
    config.port,
    localAdminToolsEnabled() ? "127.0.0.1" : "0.0.0.0",
    () =>
      console.info(JSON.stringify({ event: "listening", port: config.port })),
  );
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(cleanup);
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      void Promise.all([stopDrawWorker(), stopImageWorker()]).finally(() =>
        process.exit(1),
      );
    }, 10000);
    server.close(async () => {
      await Promise.all([stopDrawWorker(), stopImageWorker()]);
      await closePool();
      clearTimeout(deadline);
      process.exit(0);
    });
    server.closeIdleConnections();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
bootstrap().catch(() => {
  console.error(JSON.stringify({ event: "startup_failed" }));
  process.exit(1);
});
