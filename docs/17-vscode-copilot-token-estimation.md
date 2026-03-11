# 17 — VSCode Copilot Token Tracking Research

> Research spike: can we extract token usage from VSCode Copilot Chat local data?

## Status: Validated — Exact tokens available

---

## Context

Pew currently tracks 5 AI coding tools (Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw),
all of which write structured logs locally with **exact** token counts provided by
their respective APIs.

VSCode + GitHub Copilot Chat is the most popular AI coding tool. Initial
investigation incorrectly concluded that local data lacked token counts and
would require char-based estimation. **This was wrong.**

### Key Finding

`request.result.metadata` contains **exact** server-reported token counts:

- `promptTokens` — exact input tokens (server-side, includes full context)
- `outputTokens` — exact output tokens

Verified against 5 real session files:

| Metric | Count |
|--------|-------|
| Total requests with `result` | 30 |
| Requests with exact token fields | 25 (83.3%) |
| Requests missing token fields | 5 (failed/incomplete turns) |

The 5 missing requests have no `promptTokens`/`outputTokens` keys at all in their
metadata — these are incomplete turns (no model response received) and should be
treated as non-billable.

---

## Data Locations (macOS)

```
~/Library/Application Support/Code/User/
├── workspaceStorage/<workspace-hash>/
│   ├── chatSessions/<session-uuid>.jsonl         # <-- main data source
│   ├── chatEditingSessions/<session-uuid>/state.json
│   └── GitHub.copilot-chat/
│       ├── chat-session-resources/               # tool call artifacts
│       ├── local-index.1.db                      # code embedding index
│       └── workspace-chunks.db                   # chunk embeddings
├── globalStorage/
│   ├── github.copilot-chat/                      # extension assets (no usage data)
│   ├── emptyWindowChatSessions/*.jsonl            # sessions outside any workspace
│   └── state.vscdb                               # SQLite KV store (no token data)
└── chatLanguageModels.json                        # model registry
```

### Cross-Platform Paths

| Platform | Base Path |
|----------|-----------|
| macOS | `~/Library/Application Support/Code/User/` |
| Linux | `~/.config/Code/User/` |
| Windows | `%APPDATA%/Code/User/` |

### File Discovery

- One `chatSessions/` directory per **workspace** (keyed by workspace hash)
- Multiple workspaces → multiple `workspaceStorage/*/chatSessions/` directories
- `globalStorage/emptyWindowChatSessions/` for window-less sessions
- No single index file — must scan all workspace directories

---

## JSONL File Format: CRDT Operation Log

Each `.jsonl` file is a **CRDT-style append-only operation log**, not a simple array
of messages. Three operation kinds:

| kind | Name | Description |
|------|------|-------------|
| `0` | **Snapshot** | Full session state. First line of file. May have empty `requests[]` |
| `1` | **Set** | Overwrite value at a JSON path, e.g. `['requests', 0, 'result']` |
| `2` | **Append** | Append to array at path, e.g. `['requests']` or `['requests', N, 'response']` |

### Reconstructing Session State

To get the current session state, replay all operations in order:

```
line 0 (kind=0): state = snapshot.v
line N (kind=1): set(state, line.k, line.v)      # e.g. state.requests[0].result = v
line N (kind=2): append(state, line.k, line.v)    # e.g. state.requests.push(...v)
```

The `k` field is a JSON path array like `["requests", 0, "response"]`.

**Optimization**: For token extraction, we do NOT need full CRDT replay. We can
stream the JSONL and extract token data directly from `kind=1` lines where
`k[2] == "result"`, plus `kind=2` lines where `k == ["requests"]` for modelId
and timestamp. This avoids materializing the full session state.

---

## Token Extraction Strategy

### Primary: Exact Server-Reported Tokens (83%+ coverage)

Token data lives in `kind=1` Set operations targeting `['requests', N, 'result']`:

```jsonc
{
  "kind": 1,
  "k": ["requests", 0, "result"],
  "v": {
    "timings": { "totalElapsed": 356743, "firstProgress": 6613 },
    "details": "Claude Opus 4.6 • 3x",
    "metadata": {
      "promptTokens": 36533,      // <-- EXACT input tokens
      "outputTokens": 937,        // <-- EXACT output tokens
      "agentId": "...",
      "sessionId": "...",
      "renderedUserMessage": "...",
      "renderedGlobalContext": "...",
      "toolCallResults": [...],
      "toolCallRounds": [...]
    }
  }
}
```

Model ID and timestamp come from the request itself (either in `kind=0` snapshot
or `kind=2` append to `['requests']`):

```jsonc
{
  "kind": 2,
  "k": ["requests"],
  "v": [{
    "modelId": "copilot/claude-opus-4.6",   // strip "copilot/" prefix
    "timestamp": 1772780377684               // Unix ms
  }]
}
```

### Fallback: Estimation (only for missing fields)

For the ~17% of requests lacking `promptTokens`/`outputTokens` (incomplete turns):

1. **Skip by default** — treat as non-billable / incomplete
2. **Optional**: if `response[].value` text exists, estimate output as chars/4
3. Mark with `estimated: true` flag

### char/4 Estimation Accuracy (measured against real data)

| Method | Median Error |
|--------|-------------|
| Input: `message.text` + `variableData` chars / 4 | ~95.9% (useless) |
| Input: above + `renderedUserMessage` + `toolCallResults` chars / 4 | ~82.8% (bad) |
| Output: `response[].value` chars / 4 | ~49.5% (unreliable) |

**Conclusion**: char/4 estimation should only be used as a last resort. The exact
fields are available for the vast majority of requests.

---

## Available Metadata Per Request

### Token Data (from `result.metadata`)

| Field | Description | Availability |
|-------|-------------|-------------|
| `promptTokens` | Exact input tokens (full context) | 83%+ of requests |
| `outputTokens` | Exact output tokens | 83%+ of requests |

### Request Metadata

| Field | Path | Example |
|-------|------|---------|
| Model ID | `request.modelId` | `"copilot/claude-opus-4.6"`, `"copilot/claude-opus-4.6-1m"` |
| Timestamp | `request.timestamp` | `1772780377684` (Unix ms) |
| Request ID | `request.requestId` | `"request_29c78eba-..."` |
| Extension version | `request.agent.extensionVersion` | `"0.38.0"` |
| Total elapsed (ms) | `result.timings.totalElapsed` | `356743` |
| First token (ms) | `result.timings.firstProgress` | `6613` |
| Premium multiplier | `result.details` | `"Claude Opus 4.6 • 3x"` |
| Max input tokens | `inputState.selectedModel.metadata.maxInputTokens` | `127805` |
| Max output tokens | `inputState.selectedModel.metadata.maxOutputTokens` | `64000` |
| Multiplier numeric | `inputState.selectedModel.metadata.multiplierNumeric` | `3` |

### Model ID Normalization

| Raw `modelId` | Normalized Model | Notes |
|---------------|-----------------|-------|
| `copilot/claude-opus-4.6` | `claude-opus-4.6` | Strip `copilot/` prefix |
| `copilot/claude-opus-4.6-1m` | `claude-opus-4.6-1m` | 1M context variant, 6x multiplier |

---

## Comparison with Existing Sources

| Source | Input Tokens | Output Tokens | Data Quality |
|--------|-------------|---------------|--------------|
| Claude Code | Exact | Exact | API-reported per message |
| Gemini CLI | Exact | Exact | Cumulative in session JSON |
| OpenCode | Exact | Exact | Per-message in JSON/SQLite |
| OpenClaw | Exact | Exact | API-reported per message |
| **VSCode Copilot** | **Exact** | **Exact** | **Server-reported, 83%+ coverage** |

---

## Implementation Plan

### Source Type

```typescript
source: "vscode-copilot"  // new Source enum value
```

### Parser Design

Unlike other parsers that process raw API responses, the VSCode Copilot parser:

1. **Scans** `workspaceStorage/*/chatSessions/*.jsonl` + `emptyWindowChatSessions/*.jsonl`
2. **Streams** JSONL lines (no full CRDT replay needed)
3. **Extracts** from `kind=1` lines where `k[2] == "result"`:
   - `v.metadata.promptTokens` → `inputTokens`
   - `v.metadata.outputTokens` → `outputTokens`
4. **Correlates** with `kind=2` (or `kind=0`) request data for:
   - `modelId` → strip `copilot/` prefix
   - `timestamp` → for hour bucket assignment
5. **Skips** requests without token fields (incomplete turns)

### Token Mapping

| VSCode Field | Pew `TokenDelta` Field | Notes |
|-------------|----------------------|-------|
| `promptTokens` | `inputTokens` | Exact. No cache breakdown available |
| `outputTokens` | `outputTokens` | Exact |
| (none) | `cachedInputTokens` | Not available — set to 0 |
| (none) | `reasoningOutputTokens` | Not available — set to 0 |

**Limitation**: VSCode Copilot does not break down input tokens into cached vs
uncached. `cachedInputTokens` will always be 0. If `thinking` response items
exist, we *could* estimate reasoning tokens from their text length, but the
exact count is not provided.

### Cursor Type

Byte-offset cursor (same as Claude Code / OpenClaw) since JSONL is append-only:

```typescript
interface VscodeCopilotCursor extends FileCursorBase {
  offset: number;  // byte offset into JSONL file
}
```

### Open Questions

1. **VSCode Insiders**: Same structure under `Code - Insiders/` directory?
2. **Cursor IDE**: Fork of VSCode — same JSONL format under `Cursor/` directory?
3. **Windsurf/Cody/Continue**: Other VSCode AI extensions with similar data?
4. **File rotation**: Does VSCode ever truncate/rotate JSONL files?
5. **cachedInputTokens**: Any way to infer cache usage from other fields?
6. **reasoningOutputTokens**: Should we estimate from `thinking` response text?
7. **Multi-turn token accounting**: `promptTokens` includes conversation history,
   so summing across turns in a session would double-count. Need to decide:
   - Sum as-is (measures total API consumption, matches billing) ✅
   - Diff against previous turn (measures incremental, avoids double-count)

---

## Appendix: Sample Data

### Complete kind=1 Result (with tokens)

```jsonc
{
  "kind": 1,
  "k": ["requests", 0, "result"],
  "v": {
    "timings": { "totalElapsed": 356743, "firstProgress": 6613 },
    "details": "Claude Opus 4.6 • 3x",
    "metadata": {
      "promptTokens": 36533,
      "outputTokens": 937,
      "agentId": "github.copilot.editsAgent",
      "cacheKey": "...",
      "codeBlocks": [...],
      "modelMessageId": "...",
      "renderedGlobalContext": "...",
      "renderedUserMessage": "...",
      "responseId": "response_dc6357b6-...",
      "sessionId": "3a08f728-...",
      "toolCallResults": [...],
      "toolCallRounds": [...]
    }
  }
}
```

### Incomplete kind=1 Result (no tokens)

```jsonc
{
  "kind": 1,
  "k": ["requests", 7, "result"],
  "v": {
    "timings": { "totalElapsed": 538892, "firstProgress": 8300 },
    "metadata": {
      "agentId": "...",
      "modelMessageId": "...",
      "responseId": "...",
      "sessionId": "...",
      "toolCallResults": [...],
      "toolCallRounds": [...]
      // NOTE: no promptTokens, no outputTokens
    }
  }
}
```

### kind=2 Request Append (for modelId + timestamp)

```jsonc
{
  "kind": 2,
  "k": ["requests"],
  "v": [{
    "requestId": "request_29c78eba-...",
    "timestamp": 1772780377684,
    "modelId": "copilot/claude-opus-4.6",
    "message": { "text": "用户输入的原始文本..." },
    "agent": { "extensionVersion": "0.38.0", ... }
  }]
}
```

### Observed Models

```
copilot/claude-opus-4.6       (multiplier: 3x)
copilot/claude-opus-4.6-1m    (multiplier: 6x, 1M context)
```
