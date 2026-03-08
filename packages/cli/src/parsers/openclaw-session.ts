/**
 * Stub for OpenClaw session collector.
 * Tests are written first (TDD RED); implementation follows.
 */

import type { SessionSnapshot } from "@pew/core";

/** Collect session snapshots from an OpenClaw JSONL session file */
export async function collectOpenClawSessions(
  filePath: string,
): Promise<SessionSnapshot[]> {
  throw new Error("not implemented");
}
