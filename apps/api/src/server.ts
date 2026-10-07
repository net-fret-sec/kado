import { getExchangeTimeZone } from "./lib/exchange-state";
import { localAdminToolsEnabled } from "./lib/local-admin-tools";
import "dotenv/config";
import { createApp } from "./app";
import { checkDatabaseHealth } from "./db";

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || "http://0.0.0.0";
const PORT = Number(process.env.SERVER_PORT) || 3000;

async function bootstrap() {
  getExchangeTimeZone();
  const db = await checkDatabaseHealth();

  if (!db.ok) {
    console.error(`Database is not ready: ${db.error ?? "unknown error"}`);
    process.exit(1);
  }

  const app = createApp();

  app.listen(PORT, localAdminToolsEnabled() ? "127.0.0.1" : "0.0.0.0", () => {
    console.log(
      `API listening on ${localAdminToolsEnabled() ? "http://127.0.0.1" : SERVER_ADDRESS}:${PORT}`,
    );
  });
}

bootstrap().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("Failed to start API:\n", message);
  process.exit(1);
});
