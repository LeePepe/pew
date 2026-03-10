import { describe, expect, it } from "vitest";
import {
  generateInsights,
  type Insight,
  type InsightInputs,
} from "@/lib/insights";
import type { UsageRow, UsageSummary, ModelAggregate } from "@/hooks/use-usage-data";
import type { SessionOverview } from "@/lib/session-helpers";
import { getDefaultPricingMap, type PricingMap } from "@/lib/pricing";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    source: "claude-code",
    model: "claude-sonnet-4-20250514",
    hour_start: "2026-03-07T14:00:00Z",
    input_tokens: 1000,
    cached_input_tokens: 200,
    output_tokens: 500,
    reasoning_output_tokens: 0,
    total_tokens: 1700,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    input_tokens: 1_000_000,
    cached_input_tokens: 200_000,
    output_tokens: 500_000,
    reasoning_output_tokens: 0,
    total_tokens: 1_500_000,
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<ModelAggregate> = {}): ModelAggregate {
  return {
    model: "claude-sonnet-4-20250514",
    source: "claude-code",
    input: 1_000_000,
    output: 500_000,
    cached: 200_000,
    total: 1_500_000,
    ...overrides,
  };
}

function makePricingMap(): PricingMap {
  return getDefaultPricingMap();
}

function makeOverview(overrides: Partial<SessionOverview> = {}): SessionOverview {
  return {
    totalSessions: 10,
    totalHours: 5,
    avgDurationMinutes: 30,
    avgMessages: 8,
    ...overrides,
  };
}

function makeInputs(overrides: Partial<InsightInputs> = {}): InsightInputs {
  return {
    rows: [
      makeRow({ hour_start: "2026-03-05T09:00:00Z", total_tokens: 50_000 }),
      makeRow({ hour_start: "2026-03-05T10:00:00Z", total_tokens: 80_000 }),
      makeRow({ hour_start: "2026-03-06T14:00:00Z", total_tokens: 30_000 }),
      makeRow({ hour_start: "2026-03-07T09:00:00Z", total_tokens: 40_000 }),
    ],
    summary: makeSummary(),
    models: [
      makeAggregate({ model: "claude-sonnet-4-20250514", total: 1_200_000 }),
      makeAggregate({ model: "gemini-2.5-pro", source: "gemini-cli", total: 300_000 }),
    ],
    pricingMap: makePricingMap(),
    tzOffset: 0,
    ...overrides,
  };
}

function findInsight(insights: Insight[], id: string): Insight | undefined {
  return insights.find((i) => i.id === id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateInsights", () => {
  it("returns empty array for empty data", () => {
    const result = generateInsights({
      rows: [],
      summary: makeSummary({ input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 }),
      models: [],
      pricingMap: makePricingMap(),
    });
    expect(result).toEqual([]);
  });

  it("generates top-model insight when models exist", () => {
    const insights = generateInsights(makeInputs());
    const topModel = findInsight(insights, "top-model");
    expect(topModel).toBeDefined();
    expect(topModel!.description).toContain("claude-sonnet-4");
    expect(topModel!.description).toContain("80%");
  });

  it("generates top-source insight", () => {
    const inputs = makeInputs({
      rows: [
        makeRow({ source: "claude-code", total_tokens: 800_000 }),
        makeRow({ source: "gemini-cli", total_tokens: 200_000 }),
      ],
    });
    const insights = generateInsights(inputs);
    const topSource = findInsight(insights, "top-source");
    expect(topSource).toBeDefined();
    expect(topSource!.description).toContain("Claude Code");
    expect(topSource!.description).toContain("80%");
  });

  it("generates cache-rate insight when cache rate is meaningful", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({ input_tokens: 1_000_000, cached_input_tokens: 730_000 }),
    }));
    const cacheRate = findInsight(insights, "cache-rate");
    expect(cacheRate).toBeDefined();
    expect(cacheRate!.description).toContain("73%");
  });

  it("skips cache-rate when cache is zero", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({ cached_input_tokens: 0 }),
    }));
    const cacheRate = findInsight(insights, "cache-rate");
    expect(cacheRate).toBeUndefined();
  });

  it("generates peak-hour insight from half-hour rows", () => {
    // Create rows with clear peak at Wednesday 9-10 AM UTC
    const rows = [
      makeRow({ hour_start: "2026-03-04T09:00:00Z", total_tokens: 500_000 }), // Wed
      makeRow({ hour_start: "2026-03-04T09:30:00Z", total_tokens: 500_000 }), // Wed
      makeRow({ hour_start: "2026-03-04T10:00:00Z", total_tokens: 10_000 }),  // Wed
      makeRow({ hour_start: "2026-03-05T14:00:00Z", total_tokens: 20_000 }),  // Thu
    ];
    const insights = generateInsights(makeInputs({ rows, tzOffset: 0 }));
    const peak = findInsight(insights, "peak-hour");
    expect(peak).toBeDefined();
    expect(peak!.description).toContain("Wednesday");
  });

  it("generates streak insight from half-hour rows", () => {
    // 3 consecutive days
    const rows = [
      makeRow({ hour_start: "2026-03-09T10:00:00Z", total_tokens: 10_000 }),
      makeRow({ hour_start: "2026-03-10T10:00:00Z", total_tokens: 10_000 }),
      makeRow({ hour_start: "2026-03-11T10:00:00Z", total_tokens: 10_000 }),
    ];
    const insights = generateInsights(makeInputs({
      rows,
      tzOffset: 0,
      today: "2026-03-11",
    }));
    const streak = findInsight(insights, "streak");
    expect(streak).toBeDefined();
    expect(streak!.description).toContain("3-day");
  });

  it("skips streak when currentStreak < 2", () => {
    const rows = [
      makeRow({ hour_start: "2026-03-11T10:00:00Z", total_tokens: 10_000 }),
    ];
    const insights = generateInsights(makeInputs({
      rows,
      tzOffset: 0,
      today: "2026-03-11",
    }));
    const streak = findInsight(insights, "streak");
    expect(streak).toBeUndefined();
  });

  it("generates big-day insight", () => {
    const rows = [
      makeRow({ hour_start: "2026-03-05T09:00:00Z", total_tokens: 2_000_000 }),
      makeRow({ hour_start: "2026-03-05T10:00:00Z", total_tokens: 100_000 }),
      makeRow({ hour_start: "2026-03-06T09:00:00Z", total_tokens: 50_000 }),
    ];
    const insights = generateInsights(makeInputs({ rows, tzOffset: 0 }));
    const bigDay = findInsight(insights, "big-day");
    expect(bigDay).toBeDefined();
    expect(bigDay!.description).toContain("Mar 5");
    expect(bigDay!.description).toContain("2.1M");
  });

  it("generates reasoning-depth insight when ratio > 20%", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({
        output_tokens: 500_000,
        reasoning_output_tokens: 200_000,
      }),
    }));
    const reasoning = findInsight(insights, "reasoning-depth");
    expect(reasoning).toBeDefined();
    expect(reasoning!.description).toContain("40%");
  });

  it("skips reasoning-depth when ratio <= 20%", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({
        output_tokens: 500_000,
        reasoning_output_tokens: 50_000,
      }),
    }));
    const reasoning = findInsight(insights, "reasoning-depth");
    expect(reasoning).toBeUndefined();
  });

  it("generates tokens/hour insight when sessions provided", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({ total_tokens: 500_000 }),
      sessions: makeOverview({ totalHours: 5 }),
    }));
    const tokensHour = findInsight(insights, "tokens-per-hour");
    expect(tokensHour).toBeDefined();
    expect(tokensHour!.description).toContain("100.0K");
  });

  it("skips tokens/hour when no sessions", () => {
    const insights = generateInsights(makeInputs());
    const tokensHour = findInsight(insights, "tokens-per-hour");
    expect(tokensHour).toBeUndefined();
  });

  it("returns at most 6 insights", () => {
    const insights = generateInsights(makeInputs({
      summary: makeSummary({
        cached_input_tokens: 730_000,
        reasoning_output_tokens: 200_000,
        output_tokens: 500_000,
      }),
      sessions: makeOverview({ totalHours: 5 }),
      rows: [
        makeRow({ hour_start: "2026-03-09T10:00:00Z", total_tokens: 100_000 }),
        makeRow({ hour_start: "2026-03-10T10:00:00Z", total_tokens: 100_000 }),
        makeRow({ hour_start: "2026-03-11T10:00:00Z", total_tokens: 100_000 }),
      ],
      tzOffset: 0,
      today: "2026-03-11",
    }));
    expect(insights.length).toBeLessThanOrEqual(6);
  });

  it("each insight has required fields", () => {
    const insights = generateInsights(makeInputs());
    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      expect(insight.icon).toBeTruthy();
      expect(insight.title).toBeTruthy();
      expect(insight.description).toBeTruthy();
    }
  });
});
