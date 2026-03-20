# Notify Concurrency: Dirty-Key Loss Under Unlocked Parallel Sync

> Concurrent `pew notify` processes running without file lock (`degradedToUnlocked`)
> race on `queue.state.json`, causing dirty keys from earlier time windows to be
> silently overwritten. The upload engine then only sends a subset of changed
> buckets, leaving hours of token data missing from the dashboard.

## Status

| # | Commit | Description | Status |
|---|--------|-------------|--------|
| 1 | `docs: add notify concurrency dirty-key loss investigation` | This document | done |

## Symptom

User ran `pew sync` at 9:12 AM local (UTC+8). Dashboard showed the earliest
record for today at **7:30 AM** — but the user had been actively using Claude
Code and Codex since **5:00 AM**. Two and a half hours of token data were
invisible on the dashboard.

Sync output:

```
✔ Synced 120 new events → 2 queue records
✔ Uploaded 8 token records in 1 batch(es).
✔ Uploaded 62 session records in 2 batch(es).
```

## Investigation

### 1. Raw Data Integrity — OK

The local `~/.claude/projects/` JSONL files show the first file modification
today at **05:29 local** (several Claude Code sessions across bat, neo, codo,
workflow projects). Codex sessions start at **05:20 local**. No AI tool activity
between **20:21 (Mar 19)** and **05:20 (Mar 20)** — overnight sleep gap.

**Conclusion:** Raw log files are complete. No data loss at source.

### 2. Queue Contents — OK

`queue.jsonl` contains records for all time windows:

```
2026-03-19T21:00:00.000Z (local 05:00)  claude-code + codex
2026-03-19T21:30:00.000Z (local 05:30)  claude-code × 2 + codex
2026-03-19T22:00:00.000Z (local 06:00)  claude-code + codex
2026-03-19T22:30:00.000Z (local 06:30)  claude-code + codex
2026-03-19T23:00:00.000Z (local 07:00)  claude-code
2026-03-19T23:30:00.000Z (local 07:30)  claude-code + codex
2026-03-20T00:00:00.000Z (local 08:00)  claude-code + codex
2026-03-20T00:30:00.000Z (local 08:30)  claude-code + codex
2026-03-20T01:00:00.000Z (local 09:00)  claude-code + codex
```

**18 unique bucket keys** total for the affected period.
Queue file size (897614 bytes) equals `queue.state.json` offset — all records
were written successfully.

**Conclusion:** Sync pipeline correctly parsed all log files and produced
complete aggregated records in the queue.

### 3. Upload — Only 8 of 18 Keys Sent

The upload engine uses dirty-key filtering (introduced in doc 27). It uploaded
exactly **8 records**, which correspond precisely to bucket keys from
**23:30 UTC (7:30 local) onward**:

```
claude-code|claude-opus-4.6|2026-03-19T23:30:00.000Z|14a28b16-...
claude-code|claude-opus-4.6|2026-03-20T00:00:00.000Z|14a28b16-...
claude-code|claude-opus-4.6|2026-03-20T00:30:00.000Z|14a28b16-...
claude-code|claude-opus-4.6|2026-03-20T01:00:00.000Z|14a28b16-...
codex|gpt-5.4|2026-03-19T23:30:00.000Z|14a28b16-...
codex|gpt-5.4|2026-03-20T00:00:00.000Z|14a28b16-...
codex|gpt-5.4|2026-03-20T00:30:00.000Z|14a28b16-...
codex|gpt-5.4|2026-03-20T01:00:00.000Z|14a28b16-...
```

**10 keys for the 05:00–07:00 local window were missing from dirty keys.**

**Conclusion:** The dirty-key set was incomplete at upload time. Keys from
earlier time windows were lost before the upload engine could read them.

### 4. Notify Run Logs — Every Run Degraded to Unlocked

Cursor `updatedAt` timestamps show sync runs at precise 15-minute intervals
(05:30, 05:45, 06:00, ... 09:15 local), matching the `pew notify` pattern
triggered by AI tool hooks.

Run log analysis of **all 130+ runs** between 21:15 UTC and 01:15 UTC reveals:

```
degradedToUnlocked: true   — 100% of runs
waitedForLock: false        — none ever blocked on the lock
skippedSync: false          — none were skipped by coordination
```

**The file lock in `coordinator.ts` is completely non-functional.** Every notify
process falls through to `runUnlocked()`, executing `executeSync` concurrently
with no mutual exclusion.

### 5. Concurrency Pattern

Multiple notify processes fire simultaneously (triggered by Claude Code
`PostToolUse` hooks across multiple concurrent sessions). Example from a single
15-minute window:

```
2026-03-19T22:30:07  success  d=248 r=3  degraded=True   ← Process A: 248 deltas
2026-03-19T22:30:07  partial  d=  0 r=0  degraded=True   ← Process B: 0 deltas (partial)
2026-03-19T22:30:07  partial  d=  0 r=0  degraded=True   ← Process C: 0 deltas
2026-03-19T22:30:08  partial  d=  0 r=0  degraded=True   ← ...
2026-03-19T22:30:08  partial  d=  0 r=0  degraded=True
2026-03-19T22:30:08  partial  d=  0 r=0  degraded=True
2026-03-19T22:30:13  success  d=  3 r=1  degraded=True   ← Process G: 3 deltas (late)
```

Typically one process wins the cursor race and produces deltas; the others find
files unchanged and produce 0 deltas (`partial` status because session sync
may also fail for the same reason).

## Root Cause

### The Race

`pew notify` invokes `coordinatedSync()` which **always** degrades to
`runUnlocked()` — meaning `executeSync()` runs with no mutual exclusion.

The critical section in `sync.ts` lines 551–563:

```typescript
} else if (records.length > 0) {
  // Incremental with new data: SUM with existing queue records
  const { records: oldRecords } = await queue.readFromOffset(0);
  const merged = aggregateRecords([...oldRecords, ...records]);
  await queue.overwrite(merged);
  await queue.saveOffset(0);
  // Union new bucket keys into existing dirtyKeys
  const newKeys = records.map(
    (r) => `${r.source}|${r.model}|${r.hour_start}|${r.device_id}`,
  );
  const existingDirty = (await queue.loadDirtyKeys()) ?? [];
  const unionSet = new Set([...existingDirty, ...newKeys]);
  await queue.saveDirtyKeys([...unionSet]);
}
```

When two processes (A and B) enter this block concurrently:

```
Time   Process A                        Process B
─────  ───────────────────────────────  ───────────────────────────────
t1     Load dirtyKeys = [K1, K2, K3]
t2                                      Load dirtyKeys = [K1, K2, K3]
t3     Compute union = [K1..K3, K4]
t4                                      Compute union = [K1..K3, K5]
t5     Save dirtyKeys = [K1..K4]
t6                                      Save dirtyKeys = [K1..K3, K5]  ← K4 LOST
```

Process B's write overwrites Process A's, losing K4. Over many 15-minute
windows with multiple concurrent processes, this race repeatedly drops keys
from earlier time windows. The **last writer wins**, and later time windows
are more likely to survive because they're produced by later processes.

### Why the Lock Fails

`coordinator.ts` attempts `FileHandle.lock('exclusive', { nonBlocking: true })`.
When this throws, it checks for `EAGAIN`/`EWOULDBLOCK` to decide whether to
wait. But if `lock()` is not a function (runtime doesn't support it) or throws
a different error, the coordinator falls through to `runUnlocked()`.

The run logs show `degradedToUnlocked: true` on **every single run**, meaning
the lock mechanism never engages. Most likely cause: the `pew notify` process
runs under a Node.js version where `FileHandle.lock()` is not yet available
(it was added in Node.js 22.x as experimental).

### Why This Wasn't Caught by Doc 27

Doc 27 (dirty-key tracking) was designed and tested under the assumption that
only one sync process runs at a time. The coordinator's file lock was supposed
to enforce this invariant. The doc 27 crash safety analysis covers crashes
between operations but not concurrent writers — because the lock was assumed
to work.

Additionally, `pew sync` (manual CLI command) does **not** use the coordinator
at all — it calls `executeSync()` directly. So manual testing would never
reproduce the race.

## Impact

- **Token records from 05:00–07:00 local** not uploaded to D1.
- Dashboard shows a gap: earliest record at 7:30 instead of 5:00.
- The queue.jsonl **does** contain the correct data — it's a upload-side loss.
- Server-side data is recoverable via `pew reset && pew sync`.

### Severity

Medium. Data is not permanently lost (queue is intact, source files untouched).
A `pew reset && pew sync` will re-upload everything. But the bug silently drops
data on every sync cycle where notify processes run concurrently — which is
**every cycle** given the user has multiple Claude Code sessions active.

## Evidence Summary

| Check | Result |
|---|---|
| Raw JSONL files (source) | Complete — 05:00 onward |
| queue.jsonl (local queue) | Complete — 18 unique keys |
| queue.state.json dirtyKeys (at upload time) | **Incomplete — only 8 keys** |
| D1 database (dashboard) | Missing 05:00–07:00 records |
| Coordinator lock status | 100% `degradedToUnlocked` |
| Concurrent notify processes per 15-min window | 3–10 simultaneous |

## Immediate Remediation

```bash
# Full rescan + re-upload to fill the dashboard gap
pew reset && pew sync
```

This clears all cursors, re-parses all source files, marks all keys dirty,
and uploads the complete snapshot.

## Fix Direction (To Be Designed)

Three layers of defense needed:

1. **Fix the file lock** — Investigate why `FileHandle.lock()` always degrades.
   If the runtime doesn't support it, implement a fallback lock mechanism
   (e.g., `O_EXCL` lockfile, or `flock()` via native addon).

2. **Make dirty-key writes atomic** — Even with a working lock, the
   read-modify-write on `queue.state.json` is not atomic. Consider:
   - Append-only dirty key log (no read-modify-write)
   - Atomic rename pattern for state file updates
   - Or accept that a working lock is sufficient

3. **Make `pew sync` (manual) also respect the lock** — Currently it calls
   `executeSync()` directly, bypassing the coordinator. If a notify fires
   during a manual sync, they race on the same files.

## Files Involved

| File | Role |
|---|---|
| `packages/cli/src/notifier/coordinator.ts` | Lock acquisition + degraded fallback |
| `packages/cli/src/commands/sync.ts:551-563` | Dirty-key read-modify-write race |
| `packages/cli/src/storage/base-queue.ts` | `saveDirtyKeys()` / `loadDirtyKeys()` |
| `packages/cli/src/commands/upload-engine.ts:123-148` | Dirty-key filtering during upload |
| `packages/cli/src/cli.ts:175-191` | Manual sync bypasses coordinator |
| `~/.config/pew/runs/*.json` | Run log evidence |
