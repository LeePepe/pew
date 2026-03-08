import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve default paths for Pew state and AI tool data.
 * All paths can be overridden for testing.
 */
export function resolveDefaultPaths(home = homedir()) {
  return {
    /** Pew state directory: ~/.config/pew/ */
    stateDir: join(home, ".config", "pew"),
    /** Claude Code data: ~/.claude */
    claudeDir: join(home, ".claude"),
    /** Gemini CLI data: ~/.gemini */
    geminiDir: join(home, ".gemini"),
    /** OpenCode message storage: ~/.local/share/opencode/storage/message */
    openCodeMessageDir: join(
      home,
      ".local",
      "share",
      "opencode",
      "storage",
      "message",
    ),
    /** OpenClaw data: ~/.openclaw */
    openclawDir: join(home, ".openclaw"),
  };
}
