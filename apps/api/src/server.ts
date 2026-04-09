import "dotenv/config";
import { createApp } from "./app";
import { checkDatabaseHealth } from "./db";

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || "http://0.0.0.0";
const PORT = Number(process.env.SERVER_PORT) || 3000;

async function bootstrap() {
  const db = await checkDatabaseHealth();

  if (!db.ok) {
    console.error(`Database is not ready: ${db.error ?? "unknown error"}`);
    process.exit(1);
  }

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`API listening on ${SERVER_ADDRESS}:${PORT}`);
  });
}

bootstrap().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("Failed to start API:\n", message);
  process.exit(1);
});
