import { describe, it, expect } from "vitest";
import {
  buildMetric,
  compareSummaries,
  compareSources,
  compareModels,
} from "@/lib/compare-helpers";
import type { UsageSummary, SourceAggregate, ModelAggregate } from "@/hooks/use-usage-data";

// ---------------------------------------------------------------------------
// buildMetric
// ---------------------------------------------------------------------------

describe("buildMetric", () => {
  it("computes delta and leader when a > b", () => {
    const m = buildMetric(1000, 400);
    expect(m.a).toBe(1000);
    expect(m.b).toBe(400);
    expect(m.delta).toBe(-600);
    expect(m.leader).toBe("a");
    expect(m.diffPercent).toBeCloseTo(60, 1);
  });

  it("computes delta and leader when b > a", () => {
    const m = buildMetric(400, 1000);
    expect(m.delta).toBe(600);
    expect(m.leader).toBe("b");
    expect(m.diffPercent).toBeCloseTo(60, 1);
  });

  it("marks equal when values are the same", () => {
    const m = buildMetric(500, 500);
    expect(m.leader).toBe("equal");
    expect(m.delta).toBe(0);
    expect(m.diffPercent).toBe(0);
  });

  it("handles zero values without NaN", () => {
    const m = buildMetric(0, 0);
    expect(m.diffPercent).toBe(0);
    expect(m.leader).toBe("equal");
  });

  it("handles one-side zero", () => {
    const m = buildMetric(0, 100);
    expect(m.diffPercent).toBe(100);
    expect(m.leader).toBe("b");
  });
});

// ---------------------------------------------------------------------------
// compareSummaries
// ---------------------------------------------------------------------------

const makeSummary = (overrides: Partial<UsageSummary> = {}): UsageSummary => ({
  input_tokens: 1000,
  cached_input_tokens: 200,
  output_tokens: 500,
  reasoning_output_tokens: 0,
  total_tokens: 1700,
  ...overrides,
});

describe("compareSummaries", () => {
  it("computes all six metrics", () => {
    const a = makeSummary({ total_tokens: 2000, input_tokens: 1000, cached_input_tokens: 400 });
    const b = makeSummary({ total_tokens: 3000, input_tokens: 1500, cached_input_tokens: 300 });
    const result = compareSummaries(a, b, 1.5, 2.0);

    expect(result.totalTokens.a).toBe(2000);
    expect(result.totalTokens.b).toBe(3000);
    expect(result.totalTokens.leader).toBe("b");

    expect(result.estimatedCost.a).toBe(1.5);
    expect(result.estimatedCost.b).toBe(2.0);
    expect(result.estimatedCost.leader).toBe("b");
  });

  it("computes cache rate correctly", () => {
    const a = makeSummary({ input_tokens: 1000, cached_input_tokens: 200 }); // 20%
    const b = makeSummary({ input_tokens: 1000, cached_input_tokens: 500 }); // 50%
    const result = compareSummaries(a, b, 0, 0);

    expect(result.cacheRate.a).toBeCloseTo(20, 1);
    expect(result.cacheRate.b).toBeCloseTo(50, 1);
    expect(result.cacheRate.leader).toBe("b");
  });

  it("handles zero input tokens for cache rate", () => {
    const a = makeSummary({ input_tokens: 0, cached_input_tokens: 0 });
    const b = makeSummary({ input_tokens: 0, cached_input_tokens: 0 });
    const result = compareSummaries(a, b, 0, 0);

    expect(result.cacheRate.a).toBe(0);
    expect(result.cacheRate.b).toBe(0);
    expect(result.cacheRate.leader).toBe("equal");
  });
});

// ---------------------------------------------------------------------------
// compareSources
// ---------------------------------------------------------------------------

const makeSource = (source: string, label: string, value: number): SourceAggregate => ({
  source,
  label,
  value,
});

describe("compareSources", () => {
  it("merges sources from both users", () => {
    const aSources = [makeSource("claude-code", "Claude Code", 5000)];
    const bSources = [makeSource("claude-code", "Claude Code", 3000), makeSource("codex", "Codex", 2000)];

    const rows = compareSources(aSources, bSources);

    expect(rows).toHaveLength(2);
    const claudeRow = rows.find((r) => r.source === "claude-code")!;
    expect(claudeRow.a).toBe(5000);
    expect(claudeRow.b).toBe(3000);
    expect(claudeRow.leader).toBe("a");

    const codexRow = rows.find((r) => r.source === "codex")!;
    expect(codexRow.a).toBe(0);
    expect(codexRow.b).toBe(2000);
    expect(codexRow.leader).toBe("b");
  });

  it("returns empty array for empty inputs", () => {
    expect(compareSources([], [])).toHaveLength(0);
  });

  it("sorts by max value descending", () => {
    const aSources = [makeSource("small", "Small", 100), makeSource("big", "Big", 10000)];
    const bSources: SourceAggregate[] = [];
    const rows = compareSources(aSources, bSources);

    expect(rows[0]!.source).toBe("big");
    expect(rows[1]!.source).toBe("small");
  });
});

// ---------------------------------------------------------------------------
// compareModels
// ---------------------------------------------------------------------------

const makeModel = (model: string, source: string, total: number): ModelAggregate => ({
  model,
  source,
  input: total,
  output: 0,
  cached: 0,
  total,
});

describe("compareModels", () => {
  it("merges models from both users", () => {
    const aModels = [makeModel("gpt-4o", "codex", 8000)];
    const bModels = [makeModel("gpt-4o", "codex", 5000), makeModel("claude-opus", "claude-code", 3000)];

    const rows = compareModels(aModels, bModels);

    expect(rows).toHaveLength(2);
    const gptRow = rows.find((r) => r.model === "gpt-4o")!;
    expect(gptRow.aTotal).toBe(8000);
    expect(gptRow.bTotal).toBe(5000);
    expect(gptRow.leader).toBe("a");

    const claudeRow = rows.find((r) => r.model === "claude-opus")!;
    expect(claudeRow.aTotal).toBe(0);
    expect(claudeRow.bTotal).toBe(3000);
    expect(claudeRow.leader).toBe("b");
  });

  it("uses source+model composite key to avoid collisions", () => {
    const aModels = [makeModel("model-x", "source-a", 1000), makeModel("model-x", "source-b", 500)];
    const bModels: ModelAggregate[] = [];

    const rows = compareModels(aModels, bModels);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for empty inputs", () => {
    expect(compareModels([], [])).toHaveLength(0);
  });
});
