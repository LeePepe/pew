import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { geminiSessionDriver } from "../../../drivers/session/gemini-session-driver.js";
import type { SessionFileCursor } from "@pew/core";
import type { FileFingerprint } from "../../../drivers/types.js";

/** Helper: create a minimal Gemini session JSON */
function geminiSession(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    messages: [
      { type: "user", timestamp: "2026-03-07T10:00:00.000Z" },
      { type: "gemini", timestamp: "2026-03-07T10:01:00.000Z", model: "gemini-2.5-pro" },
    ],
    ...overrides,
  });
}

describe("geminiSessionDriver", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-gemini-session-driver-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("has correct kind and source", () => {
    expect(geminiSessionDriver.kind).toBe("file");
    expect(geminiSessionDriver.source).toBe("gemini-cli");
  });

  describe("discover", () => {
    it("returns [] when geminiDir is not set", async () => {
      const files = await geminiSessionDriver.discover({});
      expect(files).toEqual([]);
    });

    it("discovers session JSON files under geminiDir", async () => {
      const chatsDir = join(tempDir, "tmp", "hash1", "chats");
      await mkdir(chatsDir, { recursive: true });
      await writeFile(join(chatsDir, "session-001.json"), geminiSession());
      await writeFile(join(chatsDir, "not-session.json"), "{}");

      const files = await geminiSessionDriver.discover({ geminiDir: tempDir });
      expect(files).toHaveLength(1);
      expect(files[0]).toContain("session-001.json");
    });
  });

  describe("shouldSkip", () => {
    const fingerprint: FileFingerprint = {
      inode: 200,
      mtimeMs: 1709827200000,
      size: 2048,
    };

    it("returns false when cursor is undefined", () => {
      expect(geminiSessionDriver.shouldSkip(undefined, fingerprint)).toBe(false);
    });

    it("returns true when mtime+size match", () => {
      const cursor: SessionFileCursor = { mtimeMs: 1709827200000, size: 2048 };
      expect(geminiSessionDriver.shouldSkip(cursor, fingerprint)).toBe(true);
    });

    it("returns false when mtimeMs differs", () => {
      const cursor: SessionFileCursor = { mtimeMs: 1709827100000, size: 2048 };
      expect(geminiSessionDriver.shouldSkip(cursor, fingerprint)).toBe(false);
    });
  });

  describe("parse + buildCursor", () => {
    it("parses JSON and returns session snapshot", async () => {
      const filePath = join(tempDir, "session-001.json");
      await writeFile(filePath, geminiSession());

      const snapshots = await geminiSessionDriver.parse(filePath);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].source).toBe("gemini-cli");
      expect(snapshots[0].kind).toBe("human");
      expect(snapshots[0].userMessages).toBe(1);
      expect(snapshots[0].assistantMessages).toBe(1);
    });

    it("buildCursor returns mtime+size from fingerprint", () => {
      const fingerprint: FileFingerprint = { inode: 42, mtimeMs: 1709827200000, size: 512 };
      const cursor = geminiSessionDriver.buildCursor(fingerprint);
      expect(cursor).toEqual({ mtimeMs: 1709827200000, size: 512 });
    });
  });
});
