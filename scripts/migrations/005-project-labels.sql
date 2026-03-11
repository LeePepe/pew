-- Migration 005: Add project_labels table for user-defined project labels
-- Apply via: wrangler d1 execute zebra-db --file scripts/migrations/005-project-labels.sql

CREATE TABLE IF NOT EXISTS project_labels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  project_ref TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, project_ref)
);

CREATE INDEX IF NOT EXISTS idx_project_labels_user
  ON project_labels(user_id);
