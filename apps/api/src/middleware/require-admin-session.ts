import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/http-errors";
import { sha256 } from "../lib/crypto";
import { exchangeRepository } from "../repositories/exchange.repository";

function getExchangeIdFromParams(req: Request): string | undefined {
  const raw = req.params.exchangeId;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw;
  }
  if (Array.isArray(raw) && raw[0] && raw[0].trim().length > 0) {
    return raw[0];
  }
  return undefined;
}

function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== "bearer") return undefined;
  return token.trim() || undefined;
}

export async function requireAdminSession(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const exchangeId = getExchangeIdFromParams(req);
    if (!exchangeId) {
      throw new UnauthorizedError("Unauthorized.", {
        code: "ADMIN_SESSION_INVALID_OR_EXPIRED",
      });
    }

    const rawToken = extractBearerToken(req.header("authorization"));
    if (!rawToken) {
      throw new UnauthorizedError("Unauthorized.", {
        code: "ADMIN_SESSION_INVALID_OR_EXPIRED",
      });
    }

    const session = await exchangeRepository.findAdminSessionByTokenHash(
      sha256(rawToken),
    );

    if (!session || session.exchangeId !== exchangeId) {
      throw new UnauthorizedError("Unauthorized.", {
        code: "ADMIN_SESSION_INVALID_OR_EXPIRED",
      });
    }

    const expiresAt = new Date(session.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Unauthorized.", {
        code: "ADMIN_SESSION_INVALID_OR_EXPIRED",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}
