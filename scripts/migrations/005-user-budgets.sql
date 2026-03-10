-- Migration 005: user_budgets table
-- Per-month budget limits for token usage and cost tracking.
-- Users can set either or both USD and token limits per month.

CREATE TABLE IF NOT EXISTS user_budgets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT    NOT NULL REFERENCES users(id),
  month         TEXT    NOT NULL,    -- "2026-03" format (YYYY-MM)
  budget_usd    REAL,               -- monthly USD limit (NULL = no limit)
  budget_tokens INTEGER,            -- monthly token limit (NULL = no limit)
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_budget_user ON user_budgets(user_id);
