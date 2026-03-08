-- Migration 002: Add session_records table for session statistics pipeline
-- Apply via: wrangler d1 execute zebra-db --file scripts/migrations/002-session-records.sql

CREATE TABLE IF NOT EXISTS session_records (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             TEXT NOT NULL REFERENCES users(id),
  session_key         TEXT NOT NULL,
  source              TEXT NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'human',
  started_at          TEXT NOT NULL,
  last_message_at     TEXT NOT NULL,
  duration_seconds    INTEGER NOT NULL DEFAULT 0,
  user_messages       INTEGER NOT NULL DEFAULT 0,
  assistant_messages  INTEGER NOT NULL DEFAULT 0,
  total_messages      INTEGER NOT NULL DEFAULT 0,
  project_ref         TEXT,
  model               TEXT,
  snapshot_at         TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_session_user_time ON session_records(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_session_source ON session_records(source);
CREATE INDEX IF NOT EXISTS idx_session_kind ON session_records(kind);
