/**
 * Core type definitions for the Zebra token usage tracking system.
 *
 * Architecture:
 *   CLI (Parsers) → UsageRecord → HourBucket → Upload to SaaS
 *   SaaS (API)    → Store in D1  → Dashboard / Leaderboard
 */

// ---------------------------------------------------------------------------
// Source: Supported AI coding tools
// ---------------------------------------------------------------------------

/** The 5 supported AI coding tools */
export type Source =
  | "claude-code"
  | "codex-cli"
  | "gemini-cli"
  | "opencode"
  | "openclaw";

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

/** Token count breakdown for a single interaction */
export interface TokenDelta {
  /** Total input tokens consumed */
  inputTokens: number;
  /** Input tokens served from cache (subset of inputTokens) */
  cachedInputTokens: number;
  /** Total output tokens generated */
  outputTokens: number;
  /** Output tokens used for reasoning/thinking (subset of outputTokens) */
  reasoningOutputTokens: number;
}

// ---------------------------------------------------------------------------
// Usage record
// ---------------------------------------------------------------------------

/**
 * A single normalized usage record.
 *
 * Represents token consumption from one AI tool + model combo
 * within a specific hour bucket.
 */
export interface UsageRecord {
  /** Which AI tool produced this usage */
  source: Source;
  /** Model identifier (e.g. "claude-sonnet-4-20250514", "o3", "gemini-2.5-pro") */
  model: string;
  /** ISO 8601 hour boundary (e.g. "2026-03-07T10:00:00Z") */
  hourStart: string;
  /** Token count breakdown */
  tokens: TokenDelta;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** A collection of usage records within the same hour */
export interface HourBucket {
  /** ISO 8601 hour boundary */
  hourStart: string;
  /** All records aggregated into this bucket */
  records: UsageRecord[];
}

// ---------------------------------------------------------------------------
// Sync cursor (incremental parsing)
// ---------------------------------------------------------------------------

/** Tracks parsing position for incremental file processing */
export interface SyncCursor {
  /** Absolute path to the data file */
  filePath: string;
  /** Byte offset where we last stopped reading */
  byteOffset: number;
  /** File inode for detecting file rotation/replacement */
  inode: number;
  /** File mtime in epoch milliseconds for detecting changes */
  mtime: number;
}

// ---------------------------------------------------------------------------
// CLI Config
// ---------------------------------------------------------------------------

/** Persisted CLI configuration (stored at ~/.config/zebra/config.json) */
export interface ZebraConfig {
  /** Auth token obtained via `zebra login` */
  token?: string;
}
