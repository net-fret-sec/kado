CREATE TABLE IF NOT EXISTS suggestion_images (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  content BYTEA NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_suggestion_images_owner ON suggestion_images(participant_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_images_expiry ON suggestion_images(expires_at) WHERE expires_at IS NOT NULL;
-- Only changed rows receive a new version. WITH ORDINALITY preserves suggestion order.
UPDATE participants p SET
  wishlist = (SELECT COALESCE(jsonb_agg(item - 'icon' - 'imageUrl' ORDER BY ordinal), '[]'::jsonb)
              FROM jsonb_array_elements(p.wishlist) WITH ORDINALITY AS entries(item, ordinal)),
  updated_at = GREATEST(clock_timestamp(), p.updated_at + interval '1 millisecond')
WHERE jsonb_typeof(p.wishlist) = 'array' AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(p.wishlist) item WHERE item ? 'icon' OR item ? 'imageUrl'
);
