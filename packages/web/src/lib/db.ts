/**
 * Database abstraction layer.
 *
 * Separates read and write operations into distinct interfaces so that
 * the read path can be swapped from D1 REST API to a Cloudflare Worker
 * without touching write logic.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DbQueryResult<T = Record<string, unknown>> {
  results: T[];
  meta: { changes: number; duration: number };
}

// ---------------------------------------------------------------------------
// Read interface — safe to swap out for Worker adapter
// ---------------------------------------------------------------------------

export interface DbRead {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<DbQueryResult<T>>;

  firstOrNull<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;
}

// ---------------------------------------------------------------------------
// Write interface — stays on REST API until future Worker migration
// ---------------------------------------------------------------------------

export interface DbWrite {
  execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ changes: number; duration: number }>;

  batch(
    statements: Array<{ sql: string; params?: unknown[] }>,
  ): Promise<DbQueryResult[]>;
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

let _read: DbRead | undefined;
let _write: DbWrite | undefined;

/**
 * Get the read-only database accessor.
 *
 * Phase 1: REST adapter (via D1 HTTP API).
 * Phase 3: auto-switches to Worker adapter when WORKER_READ_URL is set.
 */
export async function getDbRead(): Promise<DbRead> {
  if (!_read) {
    const { createRestDbRead } = await import("./db-rest");
    _read = createRestDbRead();
  }
  return _read;
}

/**
 * Get the write-only database accessor.
 * Stays on REST API. Future: migrate to pew-ingest Worker.
 */
export async function getDbWrite(): Promise<DbWrite> {
  if (!_write) {
    const { createRestDbWrite } = await import("./db-rest");
    _write = createRestDbWrite();
  }
  return _write;
}

/** Reset singletons (for testing). */
export function resetDb(): void {
  _read = undefined;
  _write = undefined;
}
