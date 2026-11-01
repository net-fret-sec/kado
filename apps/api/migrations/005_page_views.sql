-- Aggregate counts only: never store an IP, URL, token, user agent or visitor ID.
CREATE TABLE page_view_counts (
  minute TIMESTAMPTZ NOT NULL,
  page TEXT NOT NULL CHECK (page IN ('home', 'organizer', 'participant')),
  views BIGINT NOT NULL DEFAULT 1 CHECK (views > 0),
  PRIMARY KEY (minute, page)
);
CREATE TABLE page_view_collection (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO page_view_collection DEFAULT VALUES;
