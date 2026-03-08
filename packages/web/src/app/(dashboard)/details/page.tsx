"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useUsageData, sourceLabel } from "@/hooks/use-usage-data";
import { formatTokens } from "@/lib/utils";
import { getModelPricing, estimateCost, formatCost } from "@/lib/pricing";
import { Skeleton } from "@/components/ui/skeleton";
import type { UsageRow } from "@/hooks/use-usage-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyGroup {
  date: string;
  records: UsageRow[];
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByDate(records: UsageRow[]): DailyGroup[] {
  const byDate = new Map<string, UsageRow[]>();

  for (const r of records) {
    const date = r.hour_start.slice(0, 10);
    const existing = byDate.get(date);
    if (existing) {
      existing.push(r);
    } else {
      byDate.set(date, [r]);
    }
  }

  return Array.from(byDate.entries())
    .map(([date, records]) => {
      let inputTokens = 0;
      let outputTokens = 0;
      let cachedTokens = 0;
      let totalTokens = 0;
      let estimatedCost = 0;

      for (const r of records) {
        inputTokens += r.input_tokens;
        outputTokens += r.output_tokens;
        cachedTokens += r.cached_input_tokens;
        totalTokens += r.total_tokens;
        const pricing = getModelPricing(r.model, r.source);
        const cost = estimateCost(r.input_tokens, r.output_tokens, r.cached_input_tokens, pricing);
        estimatedCost += cost.totalCost;
      }

      return { date, records, inputTokens, outputTokens, cachedTokens, totalTokens, estimatedCost };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function formatDate(date: string): string {
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Expandable day row
// ---------------------------------------------------------------------------

function DayRow({ group }: { group: DailyGroup }) {
  const [expanded, setExpanded] = useState(false);

  // Aggregate records by source+model for expansion
  const modelRows = useMemo(() => {
    const byKey = new Map<string, {
      source: string;
      model: string;
      input: number;
      output: number;
      cached: number;
      total: number;
      cost: number;
    }>();

    for (const r of group.records) {
      const key = `${r.source}:${r.model}`;
      const existing = byKey.get(key);
      const pricing = getModelPricing(r.model, r.source);
      const cost = estimateCost(r.input_tokens, r.output_tokens, r.cached_input_tokens, pricing);

      if (existing) {
        existing.input += r.input_tokens;
        existing.output += r.output_tokens;
        existing.cached += r.cached_input_tokens;
        existing.total += r.total_tokens;
        existing.cost += cost.totalCost;
      } else {
        byKey.set(key, {
          source: r.source,
          model: r.model,
          input: r.input_tokens,
          output: r.output_tokens,
          cached: r.cached_input_tokens,
          total: r.total_tokens,
          cost: cost.totalCost,
        });
      }
    }

    return Array.from(byKey.values()).sort((a, b) => b.total - a.total);
  }, [group.records]);

  return (
    <>
      <tr
        className="border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
            )}
            <span className="font-medium">{formatDate(group.date)}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatTokens(group.inputTokens)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums">{formatTokens(group.outputTokens)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums hidden md:table-cell">{formatTokens(group.cachedTokens)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">{formatTokens(group.totalTokens)}</td>
        <td className="px-4 py-3 text-sm text-right tabular-nums hidden sm:table-cell">{formatCost(group.estimatedCost)}</td>
      </tr>
      {expanded &&
        modelRows.map((row) => (
          <tr
            key={`${row.source}:${row.model}`}
            className="border-b border-border/30 last:border-0 bg-accent/30"
          >
            <td className="pl-10 pr-4 py-2.5 text-xs text-muted-foreground">
              <span className="text-foreground/70">{sourceLabel(row.source)}</span>
              <span className="mx-1.5 text-border">/</span>
              <span className="font-mono text-foreground/60">{row.model}</span>
            </td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">{formatTokens(row.input)}</td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">{formatTokens(row.output)}</td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground hidden md:table-cell">{formatTokens(row.cached)}</td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">{formatTokens(row.total)}</td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground hidden sm:table-cell">{formatCost(row.cost)}</td>
          </tr>
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DetailsSkeleton() {
  return (
    <div className="rounded-xl bg-secondary p-1 overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left"><Skeleton className="h-3 w-16" /></th>
            <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-12 ml-auto" /></th>
            <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-12 ml-auto" /></th>
            <th className="px-4 py-3 text-right hidden md:table-cell"><Skeleton className="h-3 w-12 ml-auto" /></th>
            <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-12 ml-auto" /></th>
            <th className="px-4 py-3 text-right hidden sm:table-cell"><Skeleton className="h-3 w-12 ml-auto" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 7 }).map((_, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="px-4 py-3"><Skeleton className="h-4 w-14 ml-auto" /></td>
              <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-14 ml-auto" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DetailsPage() {
  const { data, loading, error } = useUsageData({ days: 90 });

  const dailyGroups = useMemo(
    () => (data ? groupByDate(data.records) : []),
    [data],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display">Daily Details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Token usage broken down by day. Click a row to see per-model details.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--radius-card)] bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load usage data: {error}
        </div>
      )}

      {/* Loading */}
      {loading && <DetailsSkeleton />}

      {/* Content */}
      {!loading && data && (
        <>
          {dailyGroups.length === 0 ? (
            <div className="rounded-[var(--radius-card)] bg-secondary p-8 text-center text-sm text-muted-foreground">
              No usage data yet. Start using your AI coding tools and sync with Pew!
            </div>
          ) : (
            <div className="rounded-xl bg-secondary p-1 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Input</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Output</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">Cached</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyGroups.map((group) => (
                    <DayRow key={group.date} group={group} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
