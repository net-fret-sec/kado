import type { NextFunction, Request, Response } from "express";

interface TokenAccessAttemptState {
  timestamps: number[];
}

const attemptsByIp = new Map<string, TokenAccessAttemptState>();

const WINDOW_MS =
  Number(process.env.PARTICIPANT_ACCESS_RATE_WINDOW_MS) || 10_000;
const SOFT_LIMIT = Number(process.env.PARTICIPANT_ACCESS_RATE_SOFT_LIMIT) || 10;
const BASE_DELAY_MS =
  Number(process.env.PARTICIPANT_ACCESS_BASE_DELAY_MS) || 200;
const MAX_DELAY_MS =
  Number(process.env.PARTICIPANT_ACCESS_MAX_DELAY_MS) || 1_500;

function getClientIp(req: Request): string {
  const directIp = req.ip?.trim();
  if (directIp) return directIp;

  const xForwardedFor = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (xForwardedFor) return xForwardedFor;

  return "unknown";
}

function computeDelay(attemptCountInWindow: number): number {
  const overflow = Math.max(0, attemptCountInWindow - SOFT_LIMIT);
  if (overflow === 0) return BASE_DELAY_MS;

  const progressive = BASE_DELAY_MS + overflow * 100;
  return Math.min(MAX_DELAY_MS, progressive);
}

function scheduleCleanup() {
  const now = Date.now();

  for (const [ip, state] of attemptsByIp.entries()) {
    state.timestamps = state.timestamps.filter(
      (value) => now - value <= WINDOW_MS,
    );

    if (state.timestamps.length === 0) {
      attemptsByIp.delete(ip);
    }
  }
}

export function participantAccessRateGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const ip = getClientIp(req);
  const now = Date.now();
  const state = attemptsByIp.get(ip) ?? { timestamps: [] };

  state.timestamps = state.timestamps.filter(
    (value) => now - value <= WINDOW_MS,
  );
  state.timestamps.push(now);
  attemptsByIp.set(ip, state);

  const delayMs = computeDelay(state.timestamps.length);

  res.once("finish", () => {
    const status = res.statusCode >= 400 ? "failure" : "success";
    console.info(
      JSON.stringify({
        event: "participant_access_attempt",
        ip,
        timestamp: new Date().toISOString(),
        status,
        statusCode: res.statusCode,
      }),
    );
  });

  setTimeout(() => {
    scheduleCleanup();
    next();
  }, delayMs);
}
