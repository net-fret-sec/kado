import {
  rateLimit,
  ipKeyGenerator,
  type Store,
  type ClientRateLimitInfo,
} from "express-rate-limit";
import { HttpError } from "../lib/http-errors";
import { getConfig } from "../lib/config";
import type { RequestHandler } from "express";
export class BoundedStore implements Store {
  localKeys = true;
  private entries = new Map<string, ClientRateLimitInfo>();
  private windowMs = 60000;
  private timer?: ReturnType<typeof setInterval>;
  private sweep() {
    const now = Date.now();
    for (const [key, value] of this.entries)
      if (value.resetTime!.getTime() <= now) this.entries.delete(key);
  }
  constructor(private maximum = 10000) {}
  init(options: { windowMs: number }) {
    this.windowMs = options.windowMs;
    this.timer = setInterval(
      () => this.sweep(),
      Math.min(this.windowMs, 60000),
    );
    this.timer.unref();
  }
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    this.sweep();
    let value = this.entries.get(key);
    if (!value) {
      if (this.entries.size >= this.maximum)
        throw new HttpError(503, "Service temporarily busy.", {
          code: "SERVICE_BUSY",
        });
      value = { totalHits: 0, resetTime: new Date(now + this.windowMs) };
      this.entries.set(key, value);
    }
    value.totalHits++;
    return { ...value };
  }
  async decrement(key: string) {
    const v = this.entries.get(key);
    if (v) v.totalHits = Math.max(0, v.totalHits - 1);
  }
  async resetKey(key: string) {
    this.entries.delete(key);
  }
  shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.entries.clear();
  }
  async resetAll() {
    this.entries.clear();
  }
}
export function createRateLimits() {
  const c = getConfig();
  const make = (
    limit: number,
    windowMs: number,
    keyGenerator?: (req: Parameters<RequestHandler>[0]) => string,
    skipSuccessfulRequests = false,
  ) =>
    rateLimit({
      limit,
      windowMs,
      store: new BoundedStore(c.keys),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skipSuccessfulRequests,
      keyGenerator,
      handler: (_req, res) =>
        res.status(429).json({
          error: {
            message: "Too many requests.",
            details: { code: "RATE_LIMITED" },
          },
        }),
      validate: { trustProxy: false, xForwardedForHeader: false },
    });
  const ip = (req: Parameters<RequestHandler>[0]) =>
    ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");
  return {
    global: make(c.globalLimit, c.globalWindow),
    creation: make(c.createLimit, c.createWindow),
    auth: [
      make(c.authLimit, c.authWindow, undefined, true),
      make(
        c.authPairLimit,
        c.authWindow,
        (req) => `${ip(req)}:${req.params.exchangeId}`,
        true,
      ),
    ],
    imageUpload: make(c.images.uploadLimit, 60000),
    participant: make(c.participantLimit, c.participantWindow),
    draw: make(c.drawLimit, c.drawWindow, (req) =>
      String(req.params.exchangeId),
    ),
  };
}
