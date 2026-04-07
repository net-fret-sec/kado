import "dotenv/config";
import { createApp } from "./app";
import { loadTestData } from "./load-test-data";

const SERVER_ADDRESS = process.env.SERVER_ADDRESS || "http://0.0.0.0";
const PORT = Number(process.env.SERVER_PORT) || 3000;

const app = createApp();

loadTestData();

app.listen(PORT, () => {
  console.log(`API listening on ${SERVER_ADDRESS}:${PORT}`);
});
