import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { SessionCursorState } from "@pew/core";

const CURSORS_FILE = "session-cursors.json";

/** Creates a fresh empty session cursor state */
function emptyCursorState(): SessionCursorState {
  return { version: 1, files: {}, updatedAt: null };
}

/**
 * Persists session file cursors (mtime + size dual-check) to disk.
 * Stored at ~/.config/pew/session-cursors.json
 */
export class SessionCursorStore {
  readonly filePath: string;

  constructor(storeDir: string) {
    this.filePath = join(storeDir, CURSORS_FILE);
  }

  /** Load cursor state from disk. Returns empty state if file doesn't exist or is corrupted. */
  async load(): Promise<SessionCursorState> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as SessionCursorState;
    } catch {
      return emptyCursorState();
    }
  }

  /** Save cursor state to disk, creating the directory if needed. */
  async save(state: SessionCursorState): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2) + "\n");
  }
}
