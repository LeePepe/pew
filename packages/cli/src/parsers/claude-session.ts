/**
 * Stub for Claude session collector.
 * Tests are written first (TDD RED); implementation follows.
 */

import type { SessionSnapshot } from "@pew/core";

/** Collect session snapshots from a Claude Code JSONL file */
export async function collectClaudeSessions(
  filePath: string,
): Promise<SessionSnapshot[]> {
  throw new Error("not implemented");
}
