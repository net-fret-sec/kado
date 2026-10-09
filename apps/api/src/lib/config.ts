import { IANAZone } from "luxon";
export function integer(
  name: string,
  fallback: number,
  min = 1,
  max = 2147483647,
) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}.`);
  return value;
}
function origin(value: string, production: boolean): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (production && url.protocol !== "https:")
  )
    throw new Error("Invalid frontend origin.");
  return url.origin;
}
export function getConfig() {
  const production = process.env.NODE_ENV === "production";
  const base = process.env.FRONTEND_BASE_URL?.trim();
  const origins = (process.env.FRONTEND_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (production && (!base || !origins.length))
    throw new Error(
      "Production requires FRONTEND_BASE_URL and FRONTEND_ALLOWED_ORIGINS.",
    );
  const zone = process.env.EXCHANGE_TIME_ZONE ?? "America/Toronto";
  if (!IANAZone.isValidZone(zone))
    throw new Error("Invalid EXCHANGE_TIME_ZONE.");
  return {
    images: {
      sourceBytes: integer(
        "IMAGE_SOURCE_MAX_BYTES",
        5 * 1024 * 1024,
        1,
        10 * 1024 * 1024,
      ),
      pixels: integer("IMAGE_MAX_PIXELS", 20000000, 1, 40000000),
      dimension: integer("IMAGE_MAX_DIMENSION", 1600, 1, 3200),
      outputBytes: integer(
        "IMAGE_OUTPUT_MAX_BYTES",
        512 * 1024,
        1,
        1024 * 1024,
      ),
      participantBytes: integer(
        "IMAGE_PARTICIPANT_QUOTA_BYTES",
        10 * 1024 * 1024,
      ),
      exchangeBytes: integer("IMAGE_EXCHANGE_QUOTA_BYTES", 100 * 1024 * 1024),
      totalBytes: integer(
        "IMAGE_TOTAL_QUOTA_BYTES",
        2 * 1024 * 1024 * 1024,
        1,
        Number.MAX_SAFE_INTEGER,
      ),
      ttlMs: integer("IMAGE_TEMP_TTL_MS", 86400000, 1000, 7 * 86400000),
      transformMs: integer("IMAGE_TRANSFORM_TIMEOUT_MS", 5000, 1, 10000),
      receiveMs: integer("IMAGE_RECEIVE_TIMEOUT_MS", 10000, 1, 20000),
      uploadLimit: integer("IMAGE_UPLOAD_RATE_LIMIT", 20),
    },
    port: integer("SERVER_PORT", 3000, 1, 65535),
    trustProxy: integer("TRUST_PROXY_HOPS", 0, 0, 1),
    origins: new Set(
      [...origins, ...(base ? [base] : [])].map((v) => origin(v, production)),
    ),
    maxParticipants: integer("MAX_ACTIVE_PARTICIPANTS", 50, 3, 1000),
    queryTimeout: integer("DB_QUERY_TIMEOUT_MS", 5000, 100, 60000),
    lockTimeout: integer("DB_LOCK_TIMEOUT_MS", 3000, 100, 60000),
    drawNodes: integer("DRAW_MAX_NODES", 200000),
    drawTimeout: integer("DRAW_TIMEOUT_MS", 2000, 1, 10000),
    keys: integer("RATE_LIMIT_MAX_KEYS", 10000),
    globalLimit: integer("API_RATE_LIMIT", 600),
    globalWindow: integer("API_RATE_WINDOW_MS", 300000),
    createLimit: integer("CREATE_RATE_LIMIT", 10),
    createWindow: integer("CREATE_RATE_WINDOW_MS", 3600000),
    authLimit: integer("AUTH_RATE_LIMIT", 30),
    authPairLimit: integer("AUTH_PAIR_RATE_LIMIT", 10),
    authWindow: integer("AUTH_RATE_WINDOW_MS", 900000),
    participantLimit: integer("PARTICIPANT_RATE_LIMIT", 120),
    participantWindow: integer("PARTICIPANT_RATE_WINDOW_MS", 60000),
    drawLimit: integer("DRAW_RATE_LIMIT", 5),
    drawWindow: integer("DRAW_RATE_WINDOW_MS", 60000),
  };
}
