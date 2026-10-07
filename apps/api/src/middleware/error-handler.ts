import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-errors";
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (res.headersSent) return _next(error);
  const e = error as {
    statusCode?: number;
    status?: number;
    type?: string;
    code?: string;
    details?: unknown;
    message?: string;
  };
  if (error instanceof HttpError || e.statusCode === 403) {
    res
      .status(e.statusCode!)
      .json({ error: { message: e.message, details: e.details } });
    return;
  }
  const code =
    e.type === "entity.parse.failed"
      ? "INVALID_JSON"
      : e.type === "entity.too.large"
        ? "REQUEST_BODY_TOO_LARGE"
        : [
              "57014",
              "55P03",
              "53300",
              "57P01",
              "57P03",
              "ECONNREFUSED",
              "ECONNRESET",
              "ETIMEDOUT",
            ].includes(e.code ?? "") ||
            /timeout|Connection terminated|connection pool/i.test(
              e.message ?? "",
            )
          ? "SERVICE_UNAVAILABLE"
          : "INTERNAL_SERVER_ERROR";
  const status =
    code === "INVALID_JSON"
      ? 400
      : code === "REQUEST_BODY_TOO_LARGE"
        ? 413
        : code === "SERVICE_UNAVAILABLE"
          ? 503
          : 500;
  // Do not log driver objects, SQL, request bodies or potentially sensitive error text.
  console.error(
    JSON.stringify({
      event: "request_error",
      requestId: res.locals.requestId,
      code,
      status,
    }),
  );
  res
    .status(status)
    .json({
      error: {
        message: status >= 500 ? "Service unavailable." : "Invalid request.",
        details: { code },
      },
    });
}
