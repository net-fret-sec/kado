import { withTransaction, type DbExecutor } from "../db";
import { exchangeRepository } from "../repositories/exchange.repository";
import { adminContext, validateAdminContext } from "./admin-context";
import { NotFoundError } from "./http-errors";

export type ExchangeRecord = NonNullable<
  Awaited<ReturnType<typeof exchangeRepository.findById>>
>;

// Every mutation locks the parent first, including token rotation and self access.
export function withExchangeTransaction<T>(
  exchangeId: string,
  operation: (exchange: ExchangeRecord, db: DbExecutor) => Promise<T>,
): Promise<T> {
  return withTransaction(async (db) => {
    const exchange = await exchangeRepository.findByIdForUpdate(exchangeId, db);
    if (!exchange) {
      throw new NotFoundError("Exchange not found.", {
        code: "EXCHANGE_NOT_FOUND",
      });
    }
    const context = adminContext.getStore();
    if (context) await validateAdminContext(context, exchangeId, db);
    return operation(exchange, db);
  });
}
