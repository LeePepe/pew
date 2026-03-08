/**
 * Stub for OpenCode session collector.
 * Tests are written first (TDD RED); implementation follows.
 */

import type { SessionSnapshot } from "@pew/core";

/** Collect session snapshots from an OpenCode session directory */
export async function collectOpenCodeSessions(
  sessionDir: string,
): Promise<SessionSnapshot[]> {
  throw new Error("not implemented");
}
