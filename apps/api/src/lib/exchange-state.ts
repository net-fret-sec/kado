import { isDeepStrictEqual } from "node:util";
import { DateTime, IANAZone } from "luxon";
import { BadRequestError } from "./http-errors";

export function getExchangeTimeZone(): string {
  const zone = process.env.EXCHANGE_TIME_ZONE ?? "America/Toronto";
  if (!IANAZone.isValidZone(zone)) {
    throw new Error("Invalid EXCHANGE_TIME_ZONE.");
  }
  return zone;
}

export function archiveAt(eventDate: string): number {
  const day = DateTime.fromISO(eventDate, { zone: getExchangeTimeZone() });
  if (!day.isValid || day.toISODate() !== eventDate) {
    throw new Error("Invalid exchange event date.");
  }
  return day.startOf("day").plus({ days: 31 }).toMillis();
}

export function isExchangeArchived(
  exchange: { eventDate?: string },
  now = Date.now(),
): boolean {
  return exchange.eventDate ? now >= archiveAt(exchange.eventDate) : false;
}

export function isExchangeDrawn(exchange: { drawAt?: string }): boolean {
  return Boolean(exchange.drawAt);
}

export function assertNotArchived(exchange: { eventDate?: string }) {
  if (isExchangeArchived(exchange)) {
    throw new BadRequestError("Archived exchanges cannot be modified.", {
      code: "EXCHANGE_ARCHIVED_CANNOT_MODIFY",
    });
  }
}

export function assertUnchangedFields<T extends object>(
  current: T,
  updates: Partial<T>,
  fields: ReadonlyArray<keyof T>,
  code: string,
) {
  if (
    fields.some(
      (field) =>
        Object.hasOwn(updates, field) &&
        !isDeepStrictEqual(
          JSON.parse(JSON.stringify(updates[field] ?? null)),
          JSON.parse(JSON.stringify(current[field] ?? null)),
        ),
    )
  ) {
    throw new BadRequestError(
      "These fields cannot be modified after the draw.",
      { code },
    );
  }
}
