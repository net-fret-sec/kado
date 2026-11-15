import { query } from "../db";
import { getConfig } from "../lib/config";

// Calendar months in the exchange's civil time zone, not fixed 90/180-day periods.
// A dated exchange uses midnight on the event date; an undated one keeps its
// creation time. PostgreSQL clamps missing month-end dates to the last day.
export async function cleanupExpiredExchanges(
  batchSize = 100,
  now = new Date(),
) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error("Invalid exchange cleanup batch size.");
  const policy = getConfig().exchangeRetention;
  const result = await query(
    `WITH expired AS MATERIALIZED (
      SELECT id FROM exchanges
      WHERE (
        CASE WHEN event_date IS NOT NULL
          THEN event_date::timestamp + make_interval(months => $1::integer)
          ELSE (created_at AT TIME ZONE $3) + make_interval(months => $2::integer)
        END AT TIME ZONE $3
      ) <= $4::timestamptz
      ORDER BY id
      LIMIT $5
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM exchanges e USING expired WHERE e.id = expired.id`,
    [
      policy.afterEventMonths,
      policy.withoutEventMonths,
      policy.timeZone,
      now,
      batchSize,
    ],
  );
  // Parent locks serialize with all exchange mutations. Busy exchanges are
  // skipped and reconsidered with their current dates on the next sweep.
  // Foreign keys cascade to participants, accesses, assignments and images.
  return result.rowCount ?? 0;
}

export async function runExchangeCleanup() {
  const deadline = Date.now() + 10000;
  let deletedCount = 0;
  let batchCount: number;
  do {
    batchCount = await cleanupExpiredExchanges();
    deletedCount += batchCount;
  } while (batchCount === 100 && Date.now() < deadline);
  if (deletedCount)
    console.info(
      JSON.stringify({ event: "exchange_cleanup_completed", deletedCount }),
    );
  return deletedCount;
}
