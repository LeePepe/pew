/**
 * OpenClaw file session driver.
 *
 * Strategy: Full-scan on change (mtime + size dual-check).
 * Parser: collectOpenClawSessions(filePath)
 */

import type { SessionFileCursor } from "@pew/core";
import { discoverOpenClawFiles } from "../../discovery/sources.js";
import { collectOpenClawSessions } from "../../parsers/openclaw-session.js";
import type { FileSessionDriver, DiscoverOpts, FileFingerprint } from "../types.js";

export const openClawSessionDriver: FileSessionDriver<SessionFileCursor> = {
  kind: "file",
  source: "openclaw",

  async discover(opts: DiscoverOpts): Promise<string[]> {
    if (!opts.openclawDir) return [];
    return discoverOpenClawFiles(opts.openclawDir);
  },

  shouldSkip(cursor: SessionFileCursor | undefined, fingerprint: FileFingerprint): boolean {
    if (!cursor) return false;
    return cursor.mtimeMs === fingerprint.mtimeMs && cursor.size === fingerprint.size;
  },

  async parse(filePath: string) {
    return collectOpenClawSessions(filePath);
  },

  buildCursor(fingerprint: FileFingerprint): SessionFileCursor {
    return { mtimeMs: fingerprint.mtimeMs, size: fingerprint.size };
  },
};
