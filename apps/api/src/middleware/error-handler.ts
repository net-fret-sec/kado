import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-errors";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    error: {
      message: "Internal server error.",
    },
  });
}
