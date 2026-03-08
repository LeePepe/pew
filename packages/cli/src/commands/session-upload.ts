import type { SessionQueueRecord } from "@pew/core";

// ---------------------------------------------------------------------------
// Upload dedup
// ---------------------------------------------------------------------------

/**
 * Unlike token's aggregateRecords() which SUMS, session dedup
 * keeps only the LATEST snapshot per session_key.
 *
 * This ensures idempotent uploads: re-scanning the same session
 * files produces the same final result after server-side monotonic
 * upsert (WHERE excluded.snapshot_at >= session_records.snapshot_at).
 */
export function deduplicateSessionRecords(
  records: SessionQueueRecord[],
): SessionQueueRecord[] {
  if (records.length === 0) return [];

  const map = new Map<string, SessionQueueRecord>();
  for (const r of records) {
    const existing = map.get(r.session_key);
    if (!existing || r.snapshot_at > existing.snapshot_at) {
      map.set(r.session_key, r);
    }
  }
  return [...map.values()];
}
