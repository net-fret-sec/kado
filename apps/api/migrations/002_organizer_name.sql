ALTER TABLE exchanges ADD COLUMN organizer_name TEXT;
CREATE INDEX idx_admin_sessions_exchange_expiry ON admin_sessions(exchange_id, expires_at);
