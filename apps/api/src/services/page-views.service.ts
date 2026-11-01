import { query } from "../db";

export async function recordPageView(
  page: "home" | "organizer" | "participant",
) {
  await query(
    `
    INSERT INTO page_view_counts (minute, page)
    VALUES (date_trunc('minute', CURRENT_TIMESTAMP), $1)
    ON CONFLICT (minute, page) DO UPDATE
    SET views = page_view_counts.views + 1
  `,
    [page],
  );
}

// Also runs at startup, including after restoring a backup that excludes counts.
export async function cleanPageViews() {
  await query(
    "INSERT INTO page_view_collection DEFAULT VALUES ON CONFLICT DO NOTHING",
  );
  await query(
    "DELETE FROM page_view_counts WHERE minute < CURRENT_TIMESTAMP - interval '7 days'",
  );
}
