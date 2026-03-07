/**
 * Type-level tests for @zebra/core.
 *
 * These tests validate that the type definitions compile correctly
 * and that the Source enum contains exactly the 5 supported tools.
 */
import { describe, expect, it } from "vitest";
import type {
  HourBucket,
  Source,
  SyncCursor,
  TokenDelta,
  UsageRecord,
  ZebraConfig,
} from "../types.js";

describe("Source type", () => {
  it("should accept all 5 supported AI tools", () => {
    const sources: Source[] = [
      "claude-code",
      "codex-cli",
      "gemini-cli",
      "opencode",
      "openclaw",
    ];
    expect(sources).toHaveLength(5);
  });

  it("should reject unsupported tools at type level", () => {
    // @ts-expect-error — "every-code" is not a valid Source
    const _invalid: Source = "every-code";
    expect(_invalid).toBeDefined();
  });
});

describe("TokenDelta type", () => {
  it("should hold token counts", () => {
    const delta: TokenDelta = {
      inputTokens: 1000,
      cachedInputTokens: 200,
      outputTokens: 500,
      reasoningOutputTokens: 0,
    };
    expect(delta.inputTokens).toBe(1000);
    expect(delta.cachedInputTokens).toBe(200);
    expect(delta.outputTokens).toBe(500);
    expect(delta.reasoningOutputTokens).toBe(0);
  });

  it("should compute totalTokens from components", () => {
    const delta: TokenDelta = {
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 500,
      reasoningOutputTokens: 100,
    };
    const total =
      delta.inputTokens + delta.outputTokens + delta.reasoningOutputTokens;
    expect(total).toBe(1600);
  });
});

describe("UsageRecord type", () => {
  it("should hold a complete usage record", () => {
    const record: UsageRecord = {
      source: "claude-code",
      model: "claude-sonnet-4-20250514",
      hourStart: "2026-03-07T10:00:00Z",
      tokens: {
        inputTokens: 5000,
        cachedInputTokens: 1000,
        outputTokens: 2000,
        reasoningOutputTokens: 0,
      },
    };
    expect(record.source).toBe("claude-code");
    expect(record.model).toBe("claude-sonnet-4-20250514");
    expect(record.hourStart).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
    expect(record.tokens.inputTokens).toBe(5000);
  });
});

describe("HourBucket type", () => {
  it("should aggregate records into a bucket", () => {
    const bucket: HourBucket = {
      hourStart: "2026-03-07T10:00:00Z",
      records: [
        {
          source: "claude-code",
          model: "claude-sonnet-4-20250514",
          hourStart: "2026-03-07T10:00:00Z",
          tokens: {
            inputTokens: 5000,
            cachedInputTokens: 0,
            outputTokens: 2000,
            reasoningOutputTokens: 0,
          },
        },
        {
          source: "codex-cli",
          model: "o3",
          hourStart: "2026-03-07T10:00:00Z",
          tokens: {
            inputTokens: 3000,
            cachedInputTokens: 500,
            outputTokens: 1000,
            reasoningOutputTokens: 200,
          },
        },
      ],
    };
    expect(bucket.records).toHaveLength(2);
    expect(bucket.hourStart).toBe("2026-03-07T10:00:00Z");
  });
});

describe("SyncCursor type", () => {
  it("should track parsing position per file", () => {
    const cursor: SyncCursor = {
      filePath: "/home/user/.claude/projects/foo/session.jsonl",
      byteOffset: 4096,
      inode: 123456,
      mtime: 1709827200000,
    };
    expect(cursor.byteOffset).toBe(4096);
    expect(cursor.inode).toBe(123456);
  });
});

describe("ZebraConfig type", () => {
  it("should hold CLI configuration", () => {
    const config: ZebraConfig = {
      token: "zb_abc123",
    };
    expect(config.token).toBe("zb_abc123");
  });

  it("should allow empty config", () => {
    const config: ZebraConfig = {};
    expect(config.token).toBeUndefined();
  });
});
