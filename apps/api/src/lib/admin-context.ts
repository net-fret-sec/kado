import { AsyncLocalStorage } from "node:async_hooks";
import { UnauthorizedError } from "./http-errors";
import type { DbExecutor } from "../db";
import { exchangeRepository } from "../repositories/exchange.repository";
export interface AdminContext {
  exchangeId: string;
  tokenHash: string;
}
export const adminContext = new AsyncLocalStorage<AdminContext>();
export async function validateAdminContext(
  context: AdminContext,
  exchangeId: string,
  db?: DbExecutor,
) {
  const session = await exchangeRepository.findAdminSessionByTokenHash(
    context.tokenHash,
    db,
  );
  if (
    context.exchangeId !== exchangeId ||
    !session ||
    session.exchangeId !== exchangeId ||
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    throw new UnauthorizedError("Unauthorized.", {
      code: "ADMIN_SESSION_INVALID_OR_EXPIRED",
    });
  }
}
