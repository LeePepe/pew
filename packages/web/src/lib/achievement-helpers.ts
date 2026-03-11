/**
 * Achievement system — gamified milestones computed from usage data.
 *
 * All computation is client-side from existing API responses.
 * Each achievement has tiered thresholds (bronze → silver → gold → diamond)
 * with a progress ring showing advancement toward the next tier.
 */

import type { UsageRow, UsageSummary, ModelAggregate } from "@/hooks/use-usage-data";
import type { PricingMap } from "@/lib/pricing";
import { computeTotalCost } from "@/lib/cost-helpers";
import { computeStreak, toLocalDailyBuckets } from "@/lib/usage-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tier levels for achievements, ordered by rank. */
export type AchievementTier = "locked" | "bronze" | "silver" | "gold" | "diamond";

/** Static definition of an achievement kind. */
export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  /** Threshold values for each tier (must be ascending). */
  tiers: readonly [bronze: number, silver: number, gold: number, diamond: number];
  /** Unit label for display (e.g. "days", "tokens", "$"). */
  unit: string;
  /** Format function for display values. */
  format: (value: number) => string;
}

/** Computed state of a single achievement. */
export interface AchievementState {
  id: string;
  name: string;
  icon: string;
  tier: AchievementTier;
  /** Current value (e.g. 14 for a 14-day streak). */
  currentValue: number;
  /** Threshold for the next tier, or current tier threshold if maxed. */
  nextThreshold: number;
  /** Progress toward next tier: 0–1. 1.0 when at diamond. */
  progress: number;
  /** Human-readable current value. */
  displayValue: string;
  /** Human-readable next threshold. */
  displayThreshold: string;
  /** Tier label for display. */
  tierLabel: string;
  unit: string;
}

/** Input data for computing all achievements. */
export interface AchievementInputs {
  rows: UsageRow[];
  summary: UsageSummary;
  models: ModelAggregate[];
  pricingMap: PricingMap;
  tzOffset?: number;
  today?: string;
}

// ---------------------------------------------------------------------------
// Tier helpers
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<AchievementTier, string> = {
  locked: "Locked",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};

/**
 * Determine the current tier and progress from a value and tier thresholds.
 *
 * @param value — current metric value
 * @param tiers — [bronze, silver, gold, diamond] thresholds (ascending)
 */
export function computeTierProgress(
  value: number,
  tiers: readonly [number, number, number, number],
): { tier: AchievementTier; progress: number; nextThreshold: number } {
  const [bronze, silver, gold, diamond] = tiers;

  if (value >= diamond) {
    return { tier: "diamond", progress: 1, nextThreshold: diamond };
  }
  if (value >= gold) {
    return {
      tier: "gold",
      progress: (value - gold) / (diamond - gold),
      nextThreshold: diamond,
    };
  }
  if (value >= silver) {
    return {
      tier: "silver",
      progress: (value - silver) / (gold - silver),
      nextThreshold: gold,
    };
  }
  if (value >= bronze) {
    return {
      tier: "bronze",
      progress: (value - bronze) / (silver - bronze),
      nextThreshold: silver,
    };
  }

  // Not yet unlocked — progress toward bronze
  return {
    tier: "locked",
    progress: bronze > 0 ? value / bronze : 0,
    nextThreshold: bronze,
  };
}

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------

function formatDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

function formatShortTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(0)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

function formatDollars(n: number): string {
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
  {
    id: "streak",
    name: "On Fire",
    icon: "Flame",
    tiers: [3, 7, 14, 30],
    unit: "days",
    format: formatDays,
  },
  {
    id: "big-day",
    name: "Big Day",
    icon: "Trophy",
    tiers: [10_000, 50_000, 100_000, 500_000],
    unit: "tokens",
    format: formatShortTokens,
  },
  {
    id: "power-user",
    name: "Power User",
    icon: "Zap",
    tiers: [100_000, 1_000_000, 10_000_000, 50_000_000],
    unit: "tokens",
    format: formatShortTokens,
  },
  {
    id: "big-spender",
    name: "Big Spender",
    icon: "DollarSign",
    tiers: [1, 10, 50, 100],
    unit: "$",
    format: formatDollars,
  },
  {
    id: "veteran",
    name: "Veteran",
    icon: "Calendar",
    tiers: [7, 30, 90, 365],
    unit: "days",
    format: formatDays,
  },
  {
    id: "cache-master",
    name: "Cache Master",
    icon: "Shield",
    tiers: [10, 25, 50, 75],
    unit: "%",
    format: formatPercent,
  },
] as const;

// ---------------------------------------------------------------------------
// Value extractors — one per achievement kind
// ---------------------------------------------------------------------------

/** Extract the raw metric value for each achievement from input data. */
export function extractAchievementValues(inputs: AchievementInputs): Record<string, number> {
  const { rows, summary, models, pricingMap, tzOffset = 0, today } = inputs;

  // Streak — current streak from 365-day data
  const streak = computeStreak(rows, today, tzOffset);

  // Big Day — max daily tokens across all days
  const buckets = toLocalDailyBuckets(rows, tzOffset);
  const biggestDay = buckets.reduce((max, b) => Math.max(max, b.totalTokens), 0);

  // Power User — total tokens
  const totalTokens = summary.total_tokens;

  // Big Spender — total estimated cost
  const totalCost = computeTotalCost(models, pricingMap);

  // Veteran — unique active days
  const activeDays = buckets.length;

  // Cache Master — cache hit rate %
  const cacheRate = summary.input_tokens > 0
    ? (summary.cached_input_tokens / summary.input_tokens) * 100
    : 0;

  return {
    streak: streak.currentStreak,
    "big-day": biggestDay,
    "power-user": totalTokens,
    "big-spender": totalCost,
    veteran: activeDays,
    "cache-master": cacheRate,
  };
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

/**
 * Compute the state of all achievements from usage data.
 *
 * Returns one `AchievementState` per defined achievement, in definition order.
 */
export function computeAchievements(inputs: AchievementInputs): AchievementState[] {
  const values = extractAchievementValues(inputs);

  return ACHIEVEMENT_DEFS.map((def) => {
    const currentValue = values[def.id] ?? 0;
    const { tier, progress, nextThreshold } = computeTierProgress(currentValue, def.tiers);

    return {
      id: def.id,
      name: def.name,
      icon: def.icon,
      tier,
      currentValue,
      nextThreshold,
      progress,
      displayValue: def.format(currentValue),
      displayThreshold: def.format(nextThreshold),
      tierLabel: TIER_LABELS[tier],
      unit: def.unit,
    };
  });
}
