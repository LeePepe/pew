/**
 * Pure comparison math for the user-vs-user compare feature.
 * No React dependencies — safe to import in both client and server.
 */

import type { UsageSummary, ModelAggregate, SourceAggregate } from "@/hooks/use-usage-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompareMetric {
  /** Absolute value for user A */
  a: number;
  /** Absolute value for user B */
  b: number;
  /** b - a (positive means B is ahead) */
  delta: number;
  /**
   * Percentage difference relative to the larger value.
   * Range [0, 100]. 0 means equal; 100 means one is zero.
   */
  diffPercent: number;
  /** "a" | "b" | "equal" — who is ahead */
  leader: "a" | "b" | "equal";
}

export interface SummaryComparison {
  totalTokens: CompareMetric;
  inputTokens: CompareMetric;
  outputTokens: CompareMetric;
  cachedTokens: CompareMetric;
  cacheRate: CompareMetric;
  estimatedCost: CompareMetric;
}

export interface SourceCompareRow {
  source: string;
  label: string;
  a: number;
  b: number;
  delta: number;
  leader: "a" | "b" | "equal";
}

export interface ModelCompareRow {
  model: string;
  source: string;
  aTotal: number;
  bTotal: number;
  delta: number;
  leader: "a" | "b" | "equal";
}

// ---------------------------------------------------------------------------
// Core metric builder
// ---------------------------------------------------------------------------

export function buildMetric(a: number, b: number): CompareMetric {
  const delta = b - a;
  const maxVal = Math.max(a, b);
  const diffPercent = maxVal > 0 ? (Math.abs(delta) / maxVal) * 100 : 0;
  const leader: "a" | "b" | "equal" = a === b ? "equal" : a > b ? "a" : "b";
  return { a, b, delta, diffPercent, leader };
}

// ---------------------------------------------------------------------------
// Summary comparison
// ---------------------------------------------------------------------------

export function compareSummaries(
  a: UsageSummary,
  b: UsageSummary,
  aCost: number,
  bCost: number,
): SummaryComparison {
  const aCacheRate = a.input_tokens > 0 ? (a.cached_input_tokens / a.input_tokens) * 100 : 0;
  const bCacheRate = b.input_tokens > 0 ? (b.cached_input_tokens / b.input_tokens) * 100 : 0;

  return {
    totalTokens: buildMetric(a.total_tokens, b.total_tokens),
    inputTokens: buildMetric(a.input_tokens, b.input_tokens),
    outputTokens: buildMetric(a.output_tokens, b.output_tokens),
    cachedTokens: buildMetric(a.cached_input_tokens, b.cached_input_tokens),
    cacheRate: buildMetric(aCacheRate, bCacheRate),
    estimatedCost: buildMetric(aCost, bCost),
  };
}

// ---------------------------------------------------------------------------
// Source comparison
// ---------------------------------------------------------------------------

export function compareSources(
  aSources: SourceAggregate[],
  bSources: SourceAggregate[],
): SourceCompareRow[] {
  const allSources = new Map<string, { label: string; a: number; b: number }>();

  for (const s of aSources) {
    allSources.set(s.source, { label: s.label, a: s.value, b: 0 });
  }
  for (const s of bSources) {
    const existing = allSources.get(s.source);
    if (existing) {
      allSources.set(s.source, { ...existing, b: s.value });
    } else {
      allSources.set(s.source, { label: s.label, a: 0, b: s.value });
    }
  }

  return Array.from(allSources.entries())
    .map(([source, { label, a, b }]) => ({
      source,
      label,
      a,
      b,
      delta: b - a,
      leader: a === b ? ("equal" as const) : a > b ? ("a" as const) : ("b" as const),
    }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
}

// ---------------------------------------------------------------------------
// Model comparison
// ---------------------------------------------------------------------------

export function compareModels(
  aModels: ModelAggregate[],
  bModels: ModelAggregate[],
): ModelCompareRow[] {
  const key = (m: ModelAggregate) => `${m.source}::${m.model}`;
  const allModels = new Map<string, { model: string; source: string; a: number; b: number }>();

  for (const m of aModels) {
    allModels.set(key(m), { model: m.model, source: m.source, a: m.total, b: 0 });
  }
  for (const m of bModels) {
    const k = key(m);
    const existing = allModels.get(k);
    if (existing) {
      allModels.set(k, { ...existing, b: m.total });
    } else {
      allModels.set(k, { model: m.model, source: m.source, a: 0, b: m.total });
    }
  }

  return Array.from(allModels.values())
    .map(({ model, source, a, b }) => ({
      model,
      source,
      aTotal: a,
      bTotal: b,
      delta: b - a,
      leader: a === b ? ("equal" as const) : a > b ? ("a" as const) : ("b" as const),
    }))
    .sort((x, y) => Math.max(y.aTotal, y.bTotal) - Math.max(x.aTotal, x.bTotal));
}
