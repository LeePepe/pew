# 36 — Kosmos Support

## Summary

Add Kosmos as the 10th supported AI coding tool in pew. Kosmos stores chat sessions
as individual JSON files (`chatSession_*.json`) under platform-specific data directories.

## Data Format

Kosmos session files are JSON objects with:
- `chatSession_id` — unique session identifier
- `chat_history` — array of message objects with:
  - `id` — unique message identifier
  - `role` — "user" | "assistant"
  - `model` — model name (e.g. "gpt-4o")
  - `timestamp` — epoch ms
  - `usage` — `{ prompt_tokens, completion_tokens }` (assistant messages only)

## Data Directories

Platform-specific, scanning two app directories:

| Platform | Paths |
|----------|-------|
| macOS    | `~/Library/Application Support/kosmos-app`, `~/Library/Application Support/pm-studio-app` |
| Linux    | `~/.config/kosmos-app`, `~/.config/pm-studio-app` |
| Windows  | `%APPDATA%/kosmos-app`, `%APPDATA%/pm-studio-app` |

## Implementation

### Token Pipeline

- **Parser** (`parsers/kosmos.ts`): Reads JSON, iterates `chat_history`, extracts
  `prompt_tokens`/`completion_tokens` from assistant messages. Message-ID-based dedup
  via `KosmosCursor.processedMessageIds`.
- **Driver** (`drivers/token/kosmos-token-driver.ts`): `FileTokenDriver<KosmosCursor>`.
  Uses `fileUnchanged()` for fast skip, message-ID set for incremental dedup.

### Session Pipeline

- **Parser** (`parsers/kosmos-session.ts`): Extracts `SessionSnapshot` from
  `chat_history` — counts user/assistant messages, computes duration from timestamps.
- **Driver** (`drivers/session/kosmos-session-driver.ts`): `FileSessionDriver<SessionFileCursor>`.
  Standard mtime+size dual-check skip.

### Cursor Design

`KosmosCursor extends FileCursorBase` with `processedMessageIds: string[]`.
This handles the case where a session file grows (new messages appended)
without file replacement — the message-ID set ensures no double-counting.

## Files Changed

- `packages/core/src/types.ts` — Source union, KosmosCursor, FileCursor union
- `packages/core/src/constants.ts` — SOURCES array
- `packages/cli/src/utils/paths.ts` — resolveKosmosDataDirs, kosmosDataDirs
- `packages/cli/src/discovery/sources.ts` — discoverKosmosFiles
- `packages/cli/src/drivers/types.ts` — KosmosResumeState, DiscoverOpts
- `packages/cli/src/parsers/kosmos.ts` — NEW
- `packages/cli/src/parsers/kosmos-session.ts` — NEW
- `packages/cli/src/drivers/token/kosmos-token-driver.ts` — NEW
- `packages/cli/src/drivers/session/kosmos-session-driver.ts` — NEW
- `packages/cli/src/drivers/registry.ts` — driver registration
- `packages/cli/src/commands/sync.ts` — SyncOptions, SyncResult, sourceKey
- `packages/cli/src/commands/session-sync.ts` — SessionSyncOptions, SessionSyncResult
- `packages/cli/src/commands/status.ts` — SourceDirs, classifySource
- `packages/cli/src/commands/notify.ts` — pass-through kosmosDataDirs
- `packages/cli/src/cli.ts` — isSource, display lines, wiring
- `packages/web/src/app/globals.css` — chart-10 color
- `packages/web/src/lib/palette.ts` — AGENT_COLOR_MAP, chart.sky
- `packages/web/src/hooks/use-usage-data.ts` — SOURCE_LABELS
- `packages/web/src/lib/pricing.ts` — DEFAULT_SOURCE_DEFAULTS
- 5 API routes — VALID_SOURCES sets
