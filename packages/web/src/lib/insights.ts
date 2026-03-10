/**
 * Personal insight cards — "Spotify Wrapped"-style fun facts from usage data.
 *
 * All computation is client-side from existing API responses.
 */

import type { UsageRow, UsageSummary, ModelAggregate } from "@/hooks/use-usage-data";
import type { SessionOverview } from "@/lib/session-helpers";
import type { PricingMap } from "@/lib/pricing";
import { lookupPricing, formatCost } from "@/lib/pricing";
import { formatTokens } from "@/lib/utils";
import { sourceLabel } from "@/hooks/use-usage-data";
import { shortModel } from "@/lib/model-helpers";
import { detectPeakHours } from "@/lib/date-helpers";
import { computeStreak, toLocalDailyBuckets } from "@/lib/usage-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Insight {
  id: string;
  icon: string;
  title: string;
  description: string;
  metric?: number;
}

export interface InsightInputs {
  rows: UsageRow[];
  summary: UsageSummary;
  models: ModelAggregate[];
  pricingMap: PricingMap;
  sessions?: SessionOverview;
  tzOffset?: number;
  today?: string;
}

// ---------------------------------------------------------------------------
// Individual insight generators
// ---------------------------------------------------------------------------

function topModelInsight(models: ModelAggregate[]): Insight | null {
  if (models.length === 0) return null;

  const total = models.reduce((s, m) => s + m.total, 0);
  if (total === 0) return null;

  const top = models.reduce((a, b) => (a.total >= b.total ? a : b));
  const pct = Math.round((top.total / total) * 100);

  return {
    id: "top-model",
    icon: "Crown",
    title: "Top Model",
    description: `Your #1 model is **${shortModel(top.model)}**, at **${pct}%** of all tokens`,
    metric: pct,
  };
}

function topSourceInsight(rows: UsageRow[]): Insight | null {
  if (rows.length === 0) return null;

  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.source, (totals.get(r.source) ?? 0) + r.total_tokens);
  }

  const grandTotal = Array.from(totals.values()).reduce((s, v) => s + v, 0);
  if (grandTotal === 0) return null;

  let topSource = "";
  let topValue = 0;
  for (const [source, value] of totals) {
    if (value > topValue) {
      topSource = source;
      topValue = value;
    }
  }

  const pct = Math.round((topValue / grandTotal) * 100);

  return {
    id: "top-source",
    icon: "Wrench",
    title: "Favorite Tool",
    description: `You use **${sourceLabel(topSource)}** for **${pct}%** of your AI coding`,
    metric: pct,
  };
}

function cacheRateInsight(summary: UsageSummary, pricingMap: PricingMap): Insight | null {
  if (summary.input_tokens === 0 || summary.cached_input_tokens === 0) return null;

  const rate = Math.round((summary.cached_input_tokens / summary.input_tokens) * 100);

  // Estimate savings: difference between input price and cached price for cached tokens
  // savings = cachedTokens * (inputPrice - cachedPrice) / 1M
  const fallback = lookupPricing(pricingMap, "unknown");
  const inputPricePerM = fallback.input;
  const cachedPricePerM = fallback.cached ?? fallback.input * 0.1;
  const savings = (summary.cached_input_tokens / 1_000_000) * (inputPricePerM - cachedPricePerM);

  return {
    id: "cache-rate",
    icon: "Zap",
    title: "Cache Hit Rate",
    description: `Your cache hit rate is **${rate}%** — saving you **${formatCost(savings)}**`,
    metric: rate,
  };
}

function peakHourInsight(rows: UsageRow[], tzOffset: number): Insight | null {
  // Needs half-hour granularity rows — check first row has time component
  if (rows.length === 0) return null;
  const firstHourStart = rows[0]!.hour_start;
  if (!firstHourStart.includes("T")) return null; // day-granularity, skip

  const peaks = detectPeakHours(rows, 1, tzOffset);
  if (peaks.length === 0) return null;

  const peak = peaks[0]!;
  return {
    id: "peak-hour",
    icon: "Clock",
    title: "Peak Hour",
    description: `Your most productive slot: **${peak.dayOfWeek} ${peak.timeSlot}**`,
    metric: peak.totalTokens,
  };
}

function streakInsight(rows: UsageRow[], tzOffset: number, today?: string): Insight | null {
  if (rows.length === 0) return null;
  const firstHourStart = rows[0]!.hour_start;
  if (!firstHourStart.includes("T")) return null; // day-granularity, skip

  const streak = computeStreak(rows, today, tzOffset);
  if (streak.currentStreak < 2) return null;

  return {
    id: "streak",
    icon: "Flame",
    title: "Streak",
    description: `You're on a **${streak.currentStreak}-day streak** — keep it going!`,
    metric: streak.currentStreak,
  };
}

function bigDayInsight(rows: UsageRow[], tzOffset: number): Insight | null {
  if (rows.length === 0) return null;

  const buckets = toLocalDailyBuckets(rows, tzOffset);
  if (buckets.length === 0) return null;

  const biggest = buckets.reduce((a, b) => (a.totalTokens >= b.totalTokens ? a : b));
  if (biggest.totalTokens === 0) return null;

  // Format date as "Mar 5"
  const d = new Date(biggest.date + "T00:00:00Z");
  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return {
    id: "big-day",
    icon: "Trophy",
    title: "Biggest Day",
    description: `Your biggest day was **${dateStr}** with **${formatTokens(biggest.totalTokens)}**`,
    metric: biggest.totalTokens,
  };
}

function reasoningDepthInsight(summary: UsageSummary): Insight | null {
  if (summary.output_tokens === 0) return null;

  const ratio = summary.reasoning_output_tokens / summary.output_tokens;
  if (ratio <= 0.2) return null;

  const pct = Math.round(ratio * 100);

  return {
    id: "reasoning-depth",
    icon: "Brain",
    title: "Reasoning Depth",
    description: `**${pct}%** of your output is deep reasoning`,
    metric: pct,
  };
}

function tokensPerHourInsight(summary: UsageSummary, sessions?: SessionOverview): Insight | null {
  if (!sessions || sessions.totalHours === 0) return null;

  const tph = summary.total_tokens / sessions.totalHours;
  if (tph === 0) return null;

  return {
    id: "tokens-per-hour",
    icon: "Gauge",
    title: "Tokens/Hour",
    description: `You average **${formatTokens(Math.round(tph))}** tokens per hour of coding`,
    metric: tph,
  };
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

const MAX_INSIGHTS = 6;

/**
 * Generate personal insight cards from usage data.
 *
 * Runs all insight generators, filters nulls, and returns up to 6 sorted by
 * relevance (metric value descending).
 */
export function generateInsights(inputs: InsightInputs): Insight[] {
  const { rows, summary, models, pricingMap, sessions, tzOffset = 0, today } = inputs;

  // Short circuit: nothing to show
  if (summary.total_tokens === 0 && rows.length === 0 && models.length === 0) {
    return [];
  }

  const candidates: (Insight | null)[] = [
    topModelInsight(models),
    topSourceInsight(rows),
    cacheRateInsight(summary, pricingMap),
    peakHourInsight(rows, tzOffset),
    streakInsight(rows, tzOffset, today),
    bigDayInsight(rows, tzOffset),
    reasoningDepthInsight(summary),
    tokensPerHourInsight(summary, sessions),
  ];

  const valid = candidates.filter((c): c is Insight => c !== null);

  // Sort by metric descending (higher = more interesting)
  valid.sort((a, b) => (b.metric ?? 0) - (a.metric ?? 0));

  return valid.slice(0, MAX_INSIGHTS);
}
