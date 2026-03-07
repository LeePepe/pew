import { readFile } from "node:fs/promises";
import type { Source, TokenDelta } from "@zebra/core";
import type { ParsedDelta } from "./claude.js";
import { diffTotals } from "./gemini.js";

/** Result of parsing a single OpenCode message file */
export interface OpenCodeFileResult {
  delta: ParsedDelta | null;
  messageKey: string | null;
  lastTotals: TokenDelta | null;
}

/** Coerce to non-negative integer */
function toNonNegInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Coerce an epoch value to milliseconds.
 * Values < 1e12 are treated as seconds and multiplied by 1000.
 */
export function coerceEpochMs(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return Math.floor(n * 1000);
  return Math.floor(n);
}

/**
 * Normalize OpenCode's token object to our TokenDelta format.
 *
 * OpenCode fields:
 *   input + cache.write  → inputTokens
 *   cache.read           → cachedInputTokens
 *   output               → outputTokens
 *   reasoning            → reasoningOutputTokens
 */
export function normalizeOpenCodeTokens(
  tokens: Record<string, unknown> | null | undefined,
): TokenDelta | null {
  if (!tokens || typeof tokens !== "object") return null;

  const cache = tokens.cache as Record<string, unknown> | undefined;
  const cacheWrite = toNonNegInt(cache?.write);
  const cacheRead = toNonNegInt(cache?.read);

  return {
    inputTokens: toNonNegInt(tokens.input) + cacheWrite,
    cachedInputTokens: cacheRead,
    outputTokens: toNonNegInt(tokens.output),
    reasoningOutputTokens: toNonNegInt(tokens.reasoning),
  };
}

/** Check if a TokenDelta is all zeros */
function isAllZero(d: TokenDelta): boolean {
  return (
    d.inputTokens === 0 &&
    d.cachedInputTokens === 0 &&
    d.outputTokens === 0 &&
    d.reasoningOutputTokens === 0
  );
}

/**
 * Parse a single OpenCode message JSON file.
 *
 * Each file is a standalone JSON object for one message.
 * Uses diff against previous totals to compute incremental deltas
 * (reuses diffTotals from Gemini parser — same logic).
 */
export async function parseOpenCodeFile(opts: {
  filePath: string;
  lastTotals: TokenDelta | null;
}): Promise<OpenCodeFileResult> {
  const { filePath, lastTotals } = opts;

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return { delta: null, messageKey: null, lastTotals };
  }

  if (!raw.trim()) {
    return { delta: null, messageKey: null, lastTotals };
  }

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { delta: null, messageKey: null, lastTotals };
  }

  // Only process assistant messages
  if (msg.role !== "assistant") {
    return { delta: null, messageKey: null, lastTotals };
  }

  // Derive message key
  const sessionId = typeof msg.sessionID === "string" ? msg.sessionID : null;
  const msgId = typeof msg.id === "string" ? msg.id : null;
  const messageKey =
    sessionId && msgId ? `${sessionId}|${msgId}` : null;

  // Normalize tokens
  const currentTotals = normalizeOpenCodeTokens(
    msg.tokens as Record<string, unknown> | null,
  );
  if (!currentTotals) {
    return { delta: null, messageKey, lastTotals };
  }

  // Diff against previous
  const tokenDelta = diffTotals(currentTotals, lastTotals);
  if (!tokenDelta || isAllZero(tokenDelta)) {
    return { delta: null, messageKey, lastTotals: currentTotals };
  }

  // Extract timestamp from time.completed or time.created
  const time = msg.time as Record<string, unknown> | undefined;
  const timestampMs =
    coerceEpochMs(time?.completed) || coerceEpochMs(time?.created);
  if (!timestampMs) {
    return { delta: null, messageKey, lastTotals };
  }

  // Extract model
  const model =
    typeof msg.modelID === "string"
      ? msg.modelID.trim()
      : typeof msg.model === "string"
        ? (msg.model as string).trim()
        : "unknown";

  return {
    delta: {
      source: "opencode" as Source,
      model,
      timestamp: new Date(timestampMs).toISOString(),
      tokens: tokenDelta,
    },
    messageKey,
    lastTotals: currentTotals,
  };
}
