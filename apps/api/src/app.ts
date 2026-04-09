import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import healthRoutes from "./routes/health.routes";
import exchangesRoutes from "./routes/exchanges.routes";
import participantsRoutes from "./routes/participants.routes";
import publicRoutes from "./routes/public.routes";
import { errorHandler } from "./middleware/error-handler";

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  const fromList = (process.env.FRONTEND_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));

  const fallback = normalizeOrigin(process.env.FRONTEND_BASE_URL ?? "");

  return new Set([...(fallback ? [fallback] : []), ...fromList]);
}

export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests without Origin header (curl, server-to-server, health checks).
      if (!origin) {
        callback(null, true);
        return;
      }

      // If no allowlist is configured, stay permissive (current behavior).
      if (allowedOrigins.size === 0) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.has(origin));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
    optionsSuccessStatus: 204,
  };

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(morgan("dev"));
  app.use(express.json());

  app.use("/health", healthRoutes);
  app.use("/api", publicRoutes);
  app.use("/api/exchanges", exchangesRoutes);
  app.use("/api/exchanges", participantsRoutes);

  app.get("/__routes", (_req, res) => {
    const routes = app._router?.stack
      ?.filter((layer: any) => layer.route)
      ?.map((layer: any) => {
        const methods = Object.keys(layer.route.methods)
          .join(",")
          .toUpperCase();
        return `${methods} ${layer.route.path}`;
      });

    res.json({ routes: routes ?? [] });
  });

  app.use(errorHandler);

  return app;
}
