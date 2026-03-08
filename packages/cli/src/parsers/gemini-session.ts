/**
 * Stub for Gemini session collector.
 * Tests are written first (TDD RED); implementation follows.
 */

import type { SessionSnapshot } from "@pew/core";

/** Collect session snapshots from a Gemini CLI session JSON file */
export async function collectGeminiSessions(
  filePath: string,
): Promise<SessionSnapshot[]> {
  throw new Error("not implemented");
}
