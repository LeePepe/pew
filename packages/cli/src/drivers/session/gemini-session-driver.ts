/**
 * Gemini CLI file session driver.
 *
 * Strategy: Full-scan on change (mtime + size dual-check).
 * Parser: collectGeminiSessions(filePath)
 */

import type { SessionFileCursor } from "@pew/core";
import { discoverGeminiFiles } from "../../discovery/sources.js";
import { collectGeminiSessions } from "../../parsers/gemini-session.js";
import type { FileSessionDriver, DiscoverOpts, FileFingerprint } from "../types.js";

export const geminiSessionDriver: FileSessionDriver<SessionFileCursor> = {
  kind: "file",
  source: "gemini-cli",

  async discover(opts: DiscoverOpts): Promise<string[]> {
    if (!opts.geminiDir) return [];
    return discoverGeminiFiles(opts.geminiDir);
  },

  shouldSkip(cursor: SessionFileCursor | undefined, fingerprint: FileFingerprint): boolean {
    if (!cursor) return false;
    return cursor.mtimeMs === fingerprint.mtimeMs && cursor.size === fingerprint.size;
  },

  async parse(filePath: string) {
    return collectGeminiSessions(filePath);
  },

  buildCursor(fingerprint: FileFingerprint): SessionFileCursor {
    return { mtimeMs: fingerprint.mtimeMs, size: fingerprint.size };
  },
};
