/**
 * Claude Code file session driver.
 *
 * Strategy: Full-scan on change (mtime + size dual-check).
 * Parser: collectClaudeSessions(filePath)
 */

import type { SessionFileCursor } from "@pew/core";
import { discoverClaudeFiles } from "../../discovery/sources.js";
import { collectClaudeSessions } from "../../parsers/claude-session.js";
import type { FileSessionDriver, DiscoverOpts, FileFingerprint } from "../types.js";

export const claudeSessionDriver: FileSessionDriver<SessionFileCursor> = {
  kind: "file",
  source: "claude-code",

  async discover(opts: DiscoverOpts): Promise<string[]> {
    if (!opts.claudeDir) return [];
    return discoverClaudeFiles(opts.claudeDir);
  },

  shouldSkip(cursor: SessionFileCursor | undefined, fingerprint: FileFingerprint): boolean {
    if (!cursor) return false;
    return cursor.mtimeMs === fingerprint.mtimeMs && cursor.size === fingerprint.size;
  },

  async parse(filePath: string) {
    return collectClaudeSessions(filePath);
  },

  buildCursor(fingerprint: FileFingerprint): SessionFileCursor {
    return { mtimeMs: fingerprint.mtimeMs, size: fingerprint.size };
  },
};
