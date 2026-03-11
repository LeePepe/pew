import { describe, it, expect } from "vitest";
import {
  computeTierProgress,
  extractAchievementValues,
  computeAchievements,
  ACHIEVEMENT_DEFS,
  type AchievementInputs,
} from "@/lib/achievement-helpers";
import type { UsageRow, UsageSummary, ModelAggregate } from "@/hooks/use-usage-data";
import { getDefaultPricingMap } from "@/lib/pricing";

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

const DEFAULT_PRICING = getDefaultPricingMap();

function makeInputs(overrides: Partial<AchievementInputs> = {}): AchievementInputs {
  return {
    rows: [],
    summary: makeSummary(),
    models: [makeAggregate()],
    pricingMap: DEFAULT_PRICING,
    tzOffset: 0,
    today: "2026-03-11",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeTierProgress
// ---------------------------------------------------------------------------

describe("computeTierProgress", () => {
  const tiers = [10, 50, 100, 500] as const;

  it("returns locked with progress toward bronze when value is 0", () => {
    const result = computeTierProgress(0, tiers);
    expect(result.tier).toBe("locked");
    expect(result.progress).toBe(0);
    expect(result.nextThreshold).toBe(10);
  });

  it("returns locked with partial progress when below bronze", () => {
    const result = computeTierProgress(5, tiers);
    expect(result.tier).toBe("locked");
    expect(result.progress).toBe(0.5);
    expect(result.nextThreshold).toBe(10);
  });

  it("returns bronze at exactly the bronze threshold", () => {
    const result = computeTierProgress(10, tiers);
    expect(result.tier).toBe("bronze");
    expect(result.progress).toBe(0);
    expect(result.nextThreshold).toBe(50);
  });

  it("returns bronze with progress toward silver", () => {
    const result = computeTierProgress(30, tiers);
    expect(result.tier).toBe("bronze");
    expect(result.progress).toBe(0.5);
    expect(result.nextThreshold).toBe(50);
  });

  it("returns silver at exactly the silver threshold", () => {
    const result = computeTierProgress(50, tiers);
    expect(result.tier).toBe("silver");
    expect(result.progress).toBe(0);
    expect(result.nextThreshold).toBe(100);
  });

  it("returns gold at exactly the gold threshold", () => {
    const result = computeTierProgress(100, tiers);
    expect(result.tier).toBe("gold");
    expect(result.progress).toBe(0);
    expect(result.nextThreshold).toBe(500);
  });

  it("returns gold with partial progress toward diamond", () => {
    const result = computeTierProgress(300, tiers);
    expect(result.tier).toBe("gold");
    expect(result.progress).toBe(0.5);
    expect(result.nextThreshold).toBe(500);
  });

  it("returns diamond with progress 1 when at or above diamond", () => {
    const result = computeTierProgress(500, tiers);
    expect(result.tier).toBe("diamond");
    expect(result.progress).toBe(1);
    expect(result.nextThreshold).toBe(500);
  });

  it("returns diamond even when far above diamond threshold", () => {
    const result = computeTierProgress(9999, tiers);
    expect(result.tier).toBe("diamond");
    expect(result.progress).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// extractAchievementValues
// ---------------------------------------------------------------------------

describe("extractAchievementValues", () => {
  it("returns all zero values for empty data", () => {
    const inputs = makeInputs({
      rows: [],
      summary: makeSummary({ total_tokens: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }),
      models: [],
    });
    const values = extractAchievementValues(inputs);

    expect(values.streak).toBe(0);
    expect(values["big-day"]).toBe(0);
    expect(values["power-user"]).toBe(0);
    expect(values["big-spender"]).toBe(0);
    expect(values.veteran).toBe(0);
    expect(values["cache-master"]).toBe(0);
  });

  it("extracts correct streak value", () => {
    // Create 3 consecutive days of rows ending today
    const rows: UsageRow[] = [
      makeRow({ hour_start: "2026-03-09T10:00:00Z" }),
      makeRow({ hour_start: "2026-03-10T10:00:00Z" }),
      makeRow({ hour_start: "2026-03-11T10:00:00Z" }),
    ];
    const inputs = makeInputs({ rows, today: "2026-03-11" });
    const values = extractAchievementValues(inputs);

    expect(values.streak).toBe(3);
  });

  it("extracts correct big-day value (max daily tokens)", () => {
    const rows: UsageRow[] = [
      makeRow({ hour_start: "2026-03-09T10:00:00Z", total_tokens: 5000 }),
      makeRow({ hour_start: "2026-03-09T14:00:00Z", total_tokens: 3000 }),
      makeRow({ hour_start: "2026-03-10T10:00:00Z", total_tokens: 2000 }),
    ];
    const inputs = makeInputs({ rows });
    const values = extractAchievementValues(inputs);

    // Day 2026-03-09: 5000+3000 = 8000, Day 2026-03-10: 2000
    expect(values["big-day"]).toBe(8000);
  });

  it("extracts total tokens for power-user", () => {
    const inputs = makeInputs({
      summary: makeSummary({ total_tokens: 5_000_000 }),
    });
    const values = extractAchievementValues(inputs);

    expect(values["power-user"]).toBe(5_000_000);
  });

  it("extracts active days for veteran", () => {
    const rows: UsageRow[] = [
      makeRow({ hour_start: "2026-03-01T10:00:00Z" }),
      makeRow({ hour_start: "2026-03-01T14:00:00Z" }),
      makeRow({ hour_start: "2026-03-05T10:00:00Z" }),
      makeRow({ hour_start: "2026-03-10T10:00:00Z" }),
    ];
    const inputs = makeInputs({ rows });
    const values = extractAchievementValues(inputs);

    // 3 unique days: Mar 1, Mar 5, Mar 10
    expect(values.veteran).toBe(3);
  });

  it("extracts cache rate for cache-master", () => {
    const inputs = makeInputs({
      summary: makeSummary({
        input_tokens: 1_000_000,
        cached_input_tokens: 500_000,
      }),
    });
    const values = extractAchievementValues(inputs);

    expect(values["cache-master"]).toBe(50);
  });

  it("returns 0 cache rate when input tokens are zero", () => {
    const inputs = makeInputs({
      summary: makeSummary({
        input_tokens: 0,
        cached_input_tokens: 0,
      }),
    });
    const values = extractAchievementValues(inputs);

    expect(values["cache-master"]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeAchievements
// ---------------------------------------------------------------------------

describe("computeAchievements", () => {
  it("returns one state per defined achievement", () => {
    const inputs = makeInputs();
    const achievements = computeAchievements(inputs);

    expect(achievements).toHaveLength(ACHIEVEMENT_DEFS.length);
    expect(achievements.map((a) => a.id)).toEqual(ACHIEVEMENT_DEFS.map((d) => d.id));
  });

  it("assigns correct tiers based on values", () => {
    // 5-day streak → bronze (threshold: 3), 1.5M total → silver power-user (threshold: 1M)
    const rows: UsageRow[] = Array.from({ length: 5 }, (_, i) =>
      makeRow({ hour_start: `2026-03-${String(7 + i).padStart(2, "0")}T10:00:00Z` }),
    );
    const inputs = makeInputs({
      rows,
      today: "2026-03-11",
      summary: makeSummary({ total_tokens: 1_500_000 }),
    });
    const achievements = computeAchievements(inputs);

    const streakAch = achievements.find((a) => a.id === "streak")!;
    expect(streakAch.tier).toBe("bronze");
    expect(streakAch.currentValue).toBe(5);
    expect(streakAch.tierLabel).toBe("Bronze");

    const powerAch = achievements.find((a) => a.id === "power-user")!;
    expect(powerAch.tier).toBe("silver");
    expect(powerAch.currentValue).toBe(1_500_000);
  });

  it("includes formatted display values", () => {
    const inputs = makeInputs({
      summary: makeSummary({ total_tokens: 50_000_000 }),
    });
    const achievements = computeAchievements(inputs);

    const powerAch = achievements.find((a) => a.id === "power-user")!;
    expect(powerAch.tier).toBe("diamond");
    expect(powerAch.displayValue).toBe("50.0M");
    expect(powerAch.progress).toBe(1);
  });

  it("marks locked achievements correctly", () => {
    const inputs = makeInputs({
      rows: [],
      summary: makeSummary({
        total_tokens: 0,
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
      }),
      models: [],
    });
    const achievements = computeAchievements(inputs);

    // All should be locked with empty data
    for (const ach of achievements) {
      expect(ach.tier).toBe("locked");
      expect(ach.currentValue).toBe(0);
      expect(ach.progress).toBe(0);
    }
  });

  it("progress ring is between 0 and 1 for all achievements", () => {
    const rows: UsageRow[] = Array.from({ length: 10 }, (_, i) =>
      makeRow({
        hour_start: `2026-03-${String(2 + i).padStart(2, "0")}T10:00:00Z`,
        total_tokens: 50_000,
        input_tokens: 30_000,
        cached_input_tokens: 15_000,
        output_tokens: 20_000,
      }),
    );
    const inputs = makeInputs({
      rows,
      today: "2026-03-11",
      summary: makeSummary({
        total_tokens: 500_000,
        input_tokens: 300_000,
        cached_input_tokens: 150_000,
      }),
    });
    const achievements = computeAchievements(inputs);

    for (const ach of achievements) {
      expect(ach.progress).toBeGreaterThanOrEqual(0);
      expect(ach.progress).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// ACHIEVEMENT_DEFS validation
// ---------------------------------------------------------------------------

describe("ACHIEVEMENT_DEFS", () => {
  it("has exactly 6 achievements", () => {
    expect(ACHIEVEMENT_DEFS).toHaveLength(6);
  });

  it("all tiers are in ascending order", () => {
    for (const def of ACHIEVEMENT_DEFS) {
      const [a, b, c, d] = def.tiers;
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
      expect(c).toBeLessThan(d);
    }
  });

  it("all ids are unique", () => {
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("format functions produce non-empty strings", () => {
    for (const def of ACHIEVEMENT_DEFS) {
      expect(def.format(0).length).toBeGreaterThan(0);
      expect(def.format(def.tiers[3]).length).toBeGreaterThan(0);
    }
  });
});
