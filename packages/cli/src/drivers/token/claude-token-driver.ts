/**
 * Claude Code file token driver.
 *
 * Strategy: Byte-offset JSONL streaming.
 * Skip gate: fileUnchanged() (inode + mtimeMs + size).
 * Parser: parseClaudeFile({ filePath, startOffset })
 */

import type { ByteOffsetCursor } from "@pew/core";
import { discoverClaudeFiles } from "../../discovery/sources.js";
import { parseClaudeFile } from "../../parsers/claude.js";
import { fileUnchanged } from "../../utils/file-changed.js";
import type {
  FileTokenDriver,
  DiscoverOpts,
  SyncContext,
  FileFingerprint,
  ResumeState,
  TokenParseResult,
  ByteOffsetResumeState,
} from "../types.js";

/** Extended parse result carrying endOffset for cursor construction */
interface ClaudeParseResult extends TokenParseResult {
  endOffset: number;
}

export const claudeTokenDriver: FileTokenDriver<ByteOffsetCursor> = {
  kind: "file",
  source: "claude-code",

  async discover(opts: DiscoverOpts, _ctx: SyncContext): Promise<string[]> {
    if (!opts.claudeDir) return [];
    return discoverClaudeFiles(opts.claudeDir);
  },

  shouldSkip(cursor: ByteOffsetCursor | undefined, fingerprint: FileFingerprint): boolean {
    return fileUnchanged(cursor, fingerprint);
  },

  resumeState(cursor: ByteOffsetCursor | undefined, fingerprint: FileFingerprint): ByteOffsetResumeState {
    const startOffset =
      cursor && cursor.inode === fingerprint.inode ? (cursor.offset ?? 0) : 0;
    return { kind: "byte-offset", startOffset };
  },

  async parse(filePath: string, resume: ResumeState): Promise<ClaudeParseResult> {
    const r = resume as ByteOffsetResumeState;
    const result = await parseClaudeFile({ filePath, startOffset: r.startOffset });
    return { deltas: result.deltas, endOffset: result.endOffset };
  },

  buildCursor(
    fingerprint: FileFingerprint,
    result: TokenParseResult,
    _prev?: ByteOffsetCursor,
  ): ByteOffsetCursor {
    const r = result as ClaudeParseResult;
    return {
      inode: fingerprint.inode,
      mtimeMs: fingerprint.mtimeMs,
      size: fingerprint.size,
      offset: r.endOffset,
      updatedAt: new Date().toISOString(),
    };
  },
};
