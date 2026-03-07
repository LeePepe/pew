import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve default paths for Zebra state and AI tool data.
 * All paths can be overridden for testing.
 */
export function resolveDefaultPaths(home = homedir()) {
  return {
    /** Zebra state directory: ~/.config/zebra/ */
    stateDir: join(home, ".config", "zebra"),
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
