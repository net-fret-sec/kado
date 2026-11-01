import imageRoutes from "./routes/images.routes";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import healthRoutes from "./routes/health.routes";
import exchangesRoutes from "./routes/exchanges.routes";
import participantsRoutes from "./routes/participants.routes";
import publicRoutes from "./routes/public.routes";
import adminAuthRoutes from "./routes/admin-auth.routes";
import { errorHandler } from "./middleware/error-handler";
import { createRateLimits } from "./middleware/rate-limits";
import { getConfig } from "./lib/config";

export function createApp() {
  const app = express(),
    config = getConfig(),
    limits = createRateLimits();
  app.locals.limits = limits;
  app.set("trust proxy", config.trustProxy);
  app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));
  app.use((req, res, next) => {
    res.locals.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId);
    const start = performance.now();
    res.once("finish", () =>
      console.info(
        JSON.stringify({
          event: "request",
          requestId: res.locals.requestId,
          method: req.method,
          route: res.locals.logRoute ?? req.route?.path ?? "unmatched",
          status: res.statusCode,
          durationMs: Math.round(performance.now() - start),
        }),
      ),
    );
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    cors({
      origin: (value, cb) => {
        if (
          !value ||
          config.origins.has(value) ||
          (!config.origins.size && process.env.NODE_ENV !== "production")
        )
          return cb(null, true);
        const error = Object.assign(new Error("Origin is not allowed."), {
          statusCode: 403,
          details: { code: "CORS_ORIGIN_DENIED" },
        });
        cb(error);
      },
      methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
      optionsSuccessStatus: 204,
      exposedHeaders: [
        "Retry-After",
        "RateLimit",
        "RateLimit-Policy",
        "X-Request-Id",
      ],
    }),
  );
  app.use("/api", limits.global);
  app.use(express.json({ limit: "256kb" }));
  app.use("/health", healthRoutes);
  app.get("/api/config", (_req, res) =>
    res.json({
      maxActiveParticipants: config.maxParticipants,
      images: {
        sourceBytes: config.images.sourceBytes,
        pixels: config.images.pixels,
        dimension: config.images.dimension,
        outputBytes: config.images.outputBytes,
        formats: ["image/jpeg", "image/png", "image/webp"],
      },
    }),
  );
  app.use("/api", imageRoutes());
  app.use("/api", publicRoutes);
  app.use("/api/exchanges", exchangesRoutes);
  app.use("/api/exchanges", participantsRoutes);
  app.use("/api/exchanges", adminAuthRoutes);
  app.use((_req, res) =>
    res.status(404).json({
      error: { message: "Not found.", details: { code: "ROUTE_NOT_FOUND" } },
    }),
  );
  app.use(errorHandler);
  return app;
}
