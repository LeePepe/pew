import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCodeJsonSessionDriver } from "../../../drivers/session/opencode-json-session-driver.js";
import type { FileFingerprint } from "../../../drivers/types.js";
import type { OpenCodeJsonSessionCursor } from "../../../drivers/session/opencode-json-session-driver.js";

/** Helper: create an OpenCode message JSON file */
function openCodeMessage(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    role: "user",
    time: { created: 1735689600 },
    ...overrides,
  });
}

describe("openCodeJsonSessionDriver", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-opencode-session-driver-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has correct kind and source", () => {
    expect(openCodeJsonSessionDriver.kind).toBe("file");
    expect(openCodeJsonSessionDriver.source).toBe("opencode");
  });

  describe("discover", () => {
    it("returns [] when openCodeMessageDir is not set", async () => {
      const dirs = await openCodeJsonSessionDriver.discover({});
      expect(dirs).toEqual([]);
    });

    it("discovers session directories under messageDir", async () => {
      const ses1 = join(tempDir, "ses_001");
      const ses2 = join(tempDir, "ses_002");
      await mkdir(ses1);
      await mkdir(ses2);
      // Also create a file (should be ignored — only directories)
      await writeFile(join(tempDir, "some-file.json"), "{}");

      const dirs = await openCodeJsonSessionDriver.discover({
        openCodeMessageDir: tempDir,
      });
      expect(dirs).toHaveLength(2);
      expect(dirs[0]).toContain("ses_001");
      expect(dirs[1]).toContain("ses_002");
    });

    it("returns [] when messageDir does not exist", async () => {
      const dirs = await openCodeJsonSessionDriver.discover({
        openCodeMessageDir: join(tempDir, "nonexistent"),
      });
      expect(dirs).toEqual([]);
    });
  });

  describe("shouldSkip", () => {
    const fingerprint: FileFingerprint = {
      inode: 300,
      mtimeMs: 1709827200000,
      size: 4096,
    };

    it("returns false when cursor is undefined", () => {
      expect(openCodeJsonSessionDriver.shouldSkip(undefined, fingerprint)).toBe(false);
    });

    it("returns true when mtimeMs matches (size ignored for dirs)", () => {
      const cursor: OpenCodeJsonSessionCursor = { mtimeMs: 1709827200000 };
      expect(openCodeJsonSessionDriver.shouldSkip(cursor, fingerprint)).toBe(true);
    });

    it("returns false when mtimeMs differs", () => {
      const cursor: OpenCodeJsonSessionCursor = { mtimeMs: 1709827100000 };
      expect(openCodeJsonSessionDriver.shouldSkip(cursor, fingerprint)).toBe(false);
    });
  });

  describe("parse + buildCursor", () => {
    it("parses session directory and returns snapshots", async () => {
      const sesDir = join(tempDir, "ses_abc");
      await mkdir(sesDir);
      await writeFile(
        join(sesDir, "msg_001.json"),
        openCodeMessage({ role: "user", time: { created: 1735689600 } }),
      );
      await writeFile(
        join(sesDir, "msg_002.json"),
        openCodeMessage({
          role: "assistant",
          time: { created: 1735689660, completed: 1735689720 },
          modelID: "anthropic/claude-sonnet",
        }),
      );

      const snapshots = await openCodeJsonSessionDriver.parse(sesDir);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].source).toBe("opencode");
      expect(snapshots[0].kind).toBe("human");
      expect(snapshots[0].userMessages).toBe(1);
      expect(snapshots[0].assistantMessages).toBe(1);
    });

    it("buildCursor returns mtimeMs only (no size)", () => {
      const fingerprint: FileFingerprint = { inode: 42, mtimeMs: 1709827200000, size: 4096 };
      const cursor = openCodeJsonSessionDriver.buildCursor(fingerprint);
      expect(cursor).toEqual({ mtimeMs: 1709827200000 });
    });
  });
});
