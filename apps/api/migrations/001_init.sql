CREATE TABLE IF NOT EXISTS exchanges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  organizer_id TEXT NOT NULL,
  event_date DATE,
  budget NUMERIC(10,2),
  min_wishlist_suggestions INTEGER NOT NULL DEFAULT 0,
  lock_suggestions_after_draw BOOLEAN NOT NULL DEFAULT TRUE,
  no_mutual_assignments BOOLEAN NOT NULL DEFAULT FALSE,
  draw_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  wishlist JSONB,
  note TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  giver_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  receiver_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_id, giver_participant_id),
  UNIQUE (exchange_id, receiver_participant_id)
);

CREATE TABLE IF NOT EXISTS exclusion_rules (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  giver_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  receiver_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_id, giver_participant_id, receiver_participant_id)
);

CREATE TABLE IF NOT EXISTS admin_access (
  exchange_id TEXT PRIMARY KEY REFERENCES exchanges(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS participant_access (
  id TEXT PRIMARY KEY,
  exchange_id TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_participants_exchange_id
  ON participants(exchange_id);

CREATE INDEX IF NOT EXISTS idx_assignments_exchange_id
  ON assignments(exchange_id);

CREATE INDEX IF NOT EXISTS idx_exclusion_rules_exchange_id
  ON exclusion_rules(exchange_id);

CREATE INDEX IF NOT EXISTS idx_participant_access_participant_id
  ON participant_access(participant_id);
