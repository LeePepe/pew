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

See "User-Facing Remediation" section below.

## User-Facing Remediation

Users who encounter missing data on the dashboard can perform a full rescan:

```bash
pew reset && pew sync
```

This clears all cursors, re-parses all source files from scratch, marks every
bucket key as dirty, and uploads the complete snapshot. The server's
`ON CONFLICT ... DO UPDATE SET` upsert is idempotent — re-uploading existing
records is safe and simply overwrites with the same values.

A minor risk exists if `pew notify` fires concurrently during the reset+sync
window, but in practice the full-scan branch uses `queue.overwrite()` (not
merge), so the complete snapshot will be written regardless.

## Fix Design

Two architectural changes eliminate the root cause:

### Change 1: Reliable Process Lock + 5-Minute Cooldown

**Problem:** `FileHandle.lock()` silently fails on the user's runtime, causing
100% of notify processes to degrade to unlocked concurrent execution.

**Solution:** Replace `FileHandle.lock()` with an `O_EXCL` lockfile mechanism
that works on all Node.js versions. Combined with a **5-minute cooldown**
between sync cycles:

```
notify/sync trigger arrives
  │
  ▼
Try create lockfile (O_EXCL)
  ├── FAIL (lockfile exists) → check if stale (PID dead / age > 5 min)
  │     ├── stale → remove + retry
  │     └── not stale → EXIT (another process is running)
  │
  ├── SUCCESS → hold lock
  │     │
  │     ▼
  │   Check cooldown: was last successful sync < 5 min ago?
  │     ├── YES and trigger is notify → release lock, EXIT
  │     └── NO, or trigger is manual `pew sync` → proceed
  │           │
  │           ▼
  │         Execute sync + upload (see Change 2)
  │           │
  │           ▼
  │         Write last-sync timestamp
  │           │
  │           ▼
  │         Release lock
  └─────────────────────
```

**Cooldown rules:**

| Trigger | Cooldown check | Rationale |
|---|---|---|
| `pew notify` (hook) | Skip if last sync < 5 min ago | High-frequency hooks; data arrives in 30-min buckets anyway |
| `pew sync` (manual) | Always execute, ignore cooldown | User explicitly requested; expects immediate result |

**Why 5 minutes:** Token data is bucketed into 30-minute windows. A 5-minute
sync interval means at most 6 syncs per bucket window — more than enough to
capture all deltas while dramatically reducing contention. The previous
behavior was ~130 concurrent processes in 4 hours; this reduces it to ~48
sequential runs with zero contention.

**Lockfile details:**

- Path: `~/.config/pew/sync.lock`
- Content: `{ "pid": <number>, "startedAt": "<ISO>" }`
- Created with `O_CREAT | O_EXCL | O_WRONLY` (atomic, fails if exists)
- Stale detection: PID no longer running OR age > 5 minutes
- Removed in `finally` block (crash leaves stale file → next run detects it)

### Change 2: Unified Sync+Upload with Cursor-After-Upload

**Problem:** The current architecture separates sync (write queue + cursor)
from upload (read queue + send to server). This creates a window where cursors
advance past data that hasn't been uploaded yet. If dirty keys are lost in
that window, the data is never uploaded.

**Solution:** Merge sync and upload into a single atomic sequence. Cursors are
only persisted **after** upload succeeds:

```
  Parse deltas from source files
    │
    ▼
  Merge into queue (queue.jsonl)
    │
    ▼
  Upload dirty records to server
    │
    ├── SUCCESS → persist cursors + clear dirty keys
    │
    └── FAILURE → DO NOT persist cursors
                  (next run re-parses same deltas → re-uploads → idempotent)
```

**Current flow (broken):**

```
sync:   parse → merge queue → write dirty keys → write cursors → done
upload: read dirty keys → filter queue → send batches → clear dirty keys
```

Cursor advances at step 4 regardless of whether upload succeeds. If dirty keys
are lost between steps 3 and upload, the data is orphaned — cursor has moved
past it, dirty keys don't reference it, upload never sends it.

**New flow:**

```
sync+upload: parse → merge queue → upload dirty → SUCCESS → write cursors
                                                → FAILURE → skip cursor write
```

**Worst-case failure mode:** Upload succeeds but cursor write fails (crash
between steps). Next run re-parses the same file segment, re-produces the same
deltas, re-uploads. Server upsert (`ON CONFLICT DO UPDATE SET`) overwrites with
identical values. **Slight redundant work, zero data loss.**

**Applies to both triggers:**

| Trigger | Behavior |
|---|---|
| `pew notify` | sync+upload (within lock + cooldown) |
| `pew sync` | sync+upload (within lock, ignores cooldown) |

This eliminates the distinction between "notify = sync only" and
"sync = sync + upload". Every sync cycle completes the full pipeline.

### Combined Flow

```
┌──────────────────────────────────────────────────────┐
│  pew notify / pew sync                               │
│                                                      │
│  1. Acquire lockfile (O_EXCL)                        │
│     └── fail → exit (another process is running)     │
│                                                      │
│  2. Check cooldown (notify only)                     │
│     └── < 5 min since last sync → release lock, exit │
│                                                      │
│  3. Parse deltas from source files                   │
│  4. Merge deltas into queue.jsonl                    │
│  5. Compute dirty bucket keys                        │
│                                                      │
│  6. Upload dirty records to server                   │
│     ├── success                                      │
│     │   7a. Persist cursors                          │
│     │   7b. Clear dirty keys                         │
│     │   7c. Write last-sync timestamp                │
│     └── failure                                      │
│         7x. DO NOT persist cursors                   │
│         (next run will re-parse + re-upload)         │
│                                                      │
│  8. Release lockfile                                 │
└──────────────────────────────────────────────────────┘
```

### Failure Mode Analysis

| Failure point | State after restart | Behavior |
|---|---|---|
| Crash after lock, before parse | Stale lockfile on disk | Next run detects stale PID, removes lockfile, proceeds normally |
| Crash after queue merge, before upload | Queue has merged data, cursors not advanced | Next run re-parses same deltas, re-merges (idempotent SUM), uploads. Safe. |
| Crash after upload success, before cursor write | Server has data, cursors stale | Next run re-parses, re-uploads. Server upsert overwrites with same values. Redundant but safe. |
| Upload returns 5xx | Cursors not advanced, dirty keys preserved | Next run re-parses same segment, retries upload. Self-healing. |
| Network timeout | Same as 5xx | Same recovery path. |

**In every failure mode, the worst outcome is redundant re-upload. No data loss
is possible.**

### What Gets Removed

The dirty-key intermediate state (`dirtyKeys` in `queue.state.json`) becomes
unnecessary if cursors are only persisted after upload. However, keeping it
provides an optimization: when the cooldown causes a notify to skip, the next
run knows exactly which keys to upload without re-parsing.

**Decision: keep `dirtyKeys` as an optimization, but it is no longer the
source of truth for upload correctness.** Correctness is guaranteed by the
cursor-after-upload invariant. Dirty keys only reduce redundant work.

## Files to Modify

| File | Change |
|---|---|
| `packages/cli/src/notifier/coordinator.ts` | Replace `FileHandle.lock()` with O_EXCL lockfile; add 5-min cooldown check; add stale lock detection |
| `packages/cli/src/commands/sync.ts` | Move cursor persistence to after upload confirmation |
| `packages/cli/src/commands/notify.ts` | Add upload step (call upload engine after sync) |
| `packages/cli/src/cli.ts` | Route manual `pew sync` through the same lock path (bypass cooldown) |
| `packages/cli/src/commands/upload-engine.ts` | No change (dirty-key filtering still works) |
| `packages/cli/src/storage/base-queue.ts` | No change |
| New: `packages/cli/src/notifier/lockfile.ts` | O_EXCL lockfile implementation + stale detection |
| `packages/cli/src/__tests__/coordinator.test.ts` | Update tests for new lock mechanism + cooldown |
| `~/.config/pew/runs/*.json` | Run log evidence (existing, read-only) |

## Implementation Steps

| # | Commit | Description | Status |
|---|--------|-------------|--------|
| 1 | `docs: add notify concurrency dirty-key loss investigation` | This document | done |
| 2 | `test: add lockfile acquisition and stale detection tests` | L1 tests for new lock module | pending |
| 3 | `feat: implement O_EXCL lockfile with stale detection` | New `lockfile.ts` module | pending |
| 4 | `test: add cooldown logic tests` | L1 tests for 5-min cooldown | pending |
| 5 | `feat: add 5-min cooldown to coordinator` | Cooldown check before sync | pending |
| 6 | `test: add cursor-after-upload tests` | L1 tests for unified flow | pending |
| 7 | `feat: unify sync+upload, persist cursors after upload` | Core fix — cursor-after-upload | pending |
| 8 | `feat: add upload to notify path` | notify triggers sync+upload | pending |
| 9 | `feat: route manual sync through lock` | pew sync uses lockfile (no cooldown) | pending |
| 10 | `test: integration test for concurrent notify` | Simulate concurrent notify processes | pending |
| 11 | `chore: remove FileHandle.lock() code path` | Clean up dead code | pending |
