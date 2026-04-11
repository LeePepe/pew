"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import {
  useUsageData,
  toDailyPoints,
  sourceLabel,
} from "@/hooks/use-usage-data";
import { useDeviceData } from "@/hooks/use-device-data";
import { formatTokens, cn } from "@/lib/utils";
import { usePricingMap, lookupPricing, estimateCost, formatCost } from "@/hooks/use-pricing";
import type { PricingMap } from "@/hooks/use-pricing";
import { UsageTrendChart } from "@/components/dashboard/usage-trend-chart";
import { DeviceTrendChart } from "@/components/dashboard/device-trend-chart";
import { SourceTrendChart } from "@/components/dashboard/source-trend-chart";
import { ModelEvolutionChart } from "@/components/dashboard/model-evolution-chart";
import { DashboardSegment } from "@/components/dashboard/dashboard-segment";
import { Skeleton } from "@/components/ui/skeleton";
import {
  groupByDate,
  toSourceTrendPoints,
} from "@/lib/usage-helpers";
import { toModelEvolutionPoints } from "@/lib/model-helpers";
import type { DailyGroup } from "@/lib/usage-helpers";
import { getMonthRange, formatMonth, formatDate } from "@/lib/date-helpers";

// ---------------------------------------------------------------------------
// Expandable day row
// ---------------------------------------------------------------------------

function DayRow({ group, pricingMap }: { group: DailyGroup; pricingMap: PricingMap }) {
  const [expanded, setExpanded] = useState(false);

  const modelRows = useMemo(() => {
    const byKey = new Map<
      string,
      {
        source: string;
        model: string;
        input: number;
        output: number;
        cached: number;
        total: number;
        cost: number;
      }
    >();

    for (const r of group.records) {
      const key = `${r.source}:${r.model}`;
      const existing = byKey.get(key);
      const pricing = lookupPricing(pricingMap, r.model, r.source);
      const cost = estimateCost(
        r.input_tokens,
        r.output_tokens,
        r.cached_input_tokens,
        pricing
      );

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
  }, [group.records, pricingMap]);

  return (
    <>
      <tr
        className="border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown
                className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                strokeWidth={1.5}
              />
            ) : (
              <ChevronRight
                className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                strokeWidth={1.5}
              />
            )}
            <span className="font-medium">{formatDate(group.date)}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums">
          {formatTokens(group.inputTokens)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums">
          {formatTokens(group.outputTokens)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums hidden md:table-cell">
          {formatTokens(group.cachedTokens)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums font-medium">
          {formatTokens(group.totalTokens)}
        </td>
        <td className="px-4 py-3 text-sm text-right tabular-nums hidden sm:table-cell">
          {formatCost(group.estimatedCost)}
        </td>
      </tr>
      {expanded &&
        modelRows.map((row) => (
          <tr
            key={`${row.source}:${row.model}`}
            className="border-b border-border/30 last:border-0 bg-accent/30"
          >
            <td className="pl-10 pr-4 py-2.5 text-xs text-muted-foreground">
              <span className="text-foreground/70">
                {sourceLabel(row.source)}
              </span>
              <span className="mx-1.5 text-border">/</span>
              <span className="font-mono text-foreground/60">{row.model}</span>
            </td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">
              {formatTokens(row.input)}
            </td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">
              {formatTokens(row.output)}
            </td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground hidden md:table-cell">
              {formatTokens(row.cached)}
            </td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground">
              {formatTokens(row.total)}
            </td>
            <td className="px-4 py-2.5 text-xs text-right tabular-nums text-muted-foreground hidden sm:table-cell">
              {formatCost(row.cost)}
            </td>
          </tr>
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ChartSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-2 w-12" />
        </div>
      </div>
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  );
}

function BreakdownSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] bg-background/50 p-3">
      <Skeleton className="h-3 w-16 mb-2" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DailySkeleton() {
  return (
    <div className="grid gap-4 md:gap-6 xl:grid-cols-4">
      {/* Left column skeleton: 4 charts + table */}
      <div className="xl:col-span-3 space-y-4 md:space-y-6">
        <div className="rounded-[var(--radius-card)] border border-secondary bg-background p-4 md:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-4">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          {/* Table skeleton */}
          <div className="mt-6 rounded-xl bg-background/50 p-1 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left"><Skeleton className="h-3 w-12" /></th>
                  <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-10 ml-auto" /></th>
                  <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-10 ml-auto" /></th>
                  <th className="px-4 py-3 text-right hidden md:table-cell"><Skeleton className="h-3 w-10 ml-auto" /></th>
                  <th className="px-4 py-3 text-right"><Skeleton className="h-3 w-10 ml-auto" /></th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell"><Skeleton className="h-3 w-10 ml-auto" /></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Right column skeleton: 3 breakdown lists */}
      <div className="xl:col-span-1 space-y-4 md:space-y-6">
        <div className="rounded-[var(--radius-card)] border border-secondary bg-background p-4 md:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="space-y-4">
            <BreakdownSkeleton />
            <BreakdownSkeleton />
            <BreakdownSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DailyUsagePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { from, to } = getMonthRange(year, month);

  const { data, loading: usageLoading, error } = useUsageData({ from, to });

  // Fetch device data for the same period
  const { data: deviceData, loading: deviceLoading } = useDeviceData({ from, to });

  // Wait for all data before showing content
  const loading = usageLoading || deviceLoading;

  const { pricingMap } = usePricingMap();

  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  // Daily points for the main chart (padded to full month)
  const daily = useMemo(() => {
    if (!data) return [];
    const raw = toDailyPoints(data.records, tzOffset);
    const byDate = new Map(raw.map((d) => [d.date, d]));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const padded: typeof raw = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      padded.push(
        byDate.get(date) ?? {
          date,
          input: 0,
          output: 0,
          cached: 0,
          reasoning: 0,
          total: 0,
        }
      );
    }
    return padded;
  }, [data, year, month, tzOffset]);

  // Source trend data
  const sourceTrend = useMemo(
    () => (data ? toSourceTrendPoints(data.records, tzOffset) : []),
    [data, tzOffset]
  );

  // Model evolution data
  const modelEvolution = useMemo(
    () => (data ? toModelEvolutionPoints(data.records, tzOffset, 5) : []),
    [data, tzOffset]
  );

  // Daily groups for the table
  const dailyGroups = useMemo(
    () => (data ? groupByDate(data.records, pricingMap, tzOffset) : []),
    [data, pricingMap, tzOffset]
  );

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth();

  function goToPrevMonth() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  }

  function goToNextMonth() {
    if (isCurrentMonth) return;
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header + month nav */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold font-display tracking-tight">
            Daily Usage
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Token usage for {formatMonth(year, month)}.
          </p>
        </div>
        {/* Month pagination */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium">
            {formatMonth(year, month)}
          </span>
          <button
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              isCurrentMonth
                ? "text-muted-foreground/30 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--radius-card)] bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load usage data: {error}
        </div>
      )}

      {/* Loading */}
      {loading && <DailySkeleton />}

      {/* Content */}
      {!loading && data && (
        <>
          {data.summary.total_tokens > 0 ? (
            <div className="grid gap-4 md:gap-6 xl:grid-cols-4">
              {/* Left column: Daily charts + Detail table (3/4) */}
              <div className="xl:col-span-3 space-y-4 md:space-y-6">
                <DashboardSegment title="Monthly Timeline">
                  <div className="space-y-4">
                    {/* Input / Output */}
                    <UsageTrendChart data={daily} />

                    {/* By Device */}
                    {deviceData?.timeline && deviceData?.devices && (
                      <DeviceTrendChart
                        timeline={deviceData.timeline}
                        devices={deviceData.devices}
                      />
                    )}

                    {/* By Agent */}
                    <SourceTrendChart data={sourceTrend} />

                    {/* By Model */}
                    <ModelEvolutionChart data={modelEvolution} />
                  </div>

                  {/* Per-day detail table */}
                  {dailyGroups.length > 0 && (
                    <div className="mt-6 rounded-xl bg-background/50 p-1 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                              Date
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                              Input
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                              Output
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden md:table-cell">
                              Cached
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                              Total
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground hidden sm:table-cell">
                              Est. Cost
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyGroups.map((group) => (
                            <DayRow
                              key={group.date}
                              group={group}
                              pricingMap={pricingMap}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DashboardSegment>
              </div>

              {/* Right column: Monthly breakdown charts (1/4) */}
              <div className="xl:col-span-1 space-y-4 md:space-y-6">
                <DashboardSegment title="Monthly Breakdown">
                  <div className="space-y-4">
                    {/* Device breakdown - use device share or simple summary */}
                    {deviceData?.devices && deviceData.devices.length > 0 && (
                      <div className="rounded-[var(--radius-card)] bg-background/50 p-3">
                        <p className="text-xs text-muted-foreground mb-2">By Device</p>
                        <div className="space-y-2">
                          {deviceData.devices.slice(0, 5).map((d) => (
                            <div key={d.device_id} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate max-w-[120px]">
                                {d.alias || d.device_id.slice(0, 8)}
                              </span>
                              <span className="tabular-nums">{formatTokens(d.total_tokens)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Agent breakdown */}
                    {sourceTrend.length > 0 && (
                      <div className="rounded-[var(--radius-card)] bg-background/50 p-3">
                        <p className="text-xs text-muted-foreground mb-2">By Agent</p>
                        <div className="space-y-2">
                          {(() => {
                            // Aggregate sources from trend data
                            const totals = new Map<string, number>();
                            for (const pt of sourceTrend) {
                              for (const [src, val] of Object.entries(pt.sources)) {
                                totals.set(src, (totals.get(src) ?? 0) + val);
                              }
                            }
                            return Array.from(totals.entries())
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 5)
                              .map(([src, total]) => (
                                <div key={src} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{sourceLabel(src)}</span>
                                  <span className="tabular-nums">{formatTokens(total)}</span>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Model breakdown */}
                    {modelEvolution.length > 0 && (
                      <div className="rounded-[var(--radius-card)] bg-background/50 p-3">
                        <p className="text-xs text-muted-foreground mb-2">By Model</p>
                        <div className="space-y-2">
                          {(() => {
                            // Aggregate models from evolution data
                            const totals = new Map<string, number>();
                            for (const pt of modelEvolution) {
                              for (const [model, val] of Object.entries(pt.models)) {
                                totals.set(model, (totals.get(model) ?? 0) + val);
                              }
                            }
                            return Array.from(totals.entries())
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 5)
                              .map(([model, total]) => (
                                <div key={model} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground truncate max-w-[100px]">{model}</span>
                                  <span className="tabular-nums">{formatTokens(total)}</span>
                                </div>
                              ));
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </DashboardSegment>
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--radius-card)] bg-secondary p-8 text-center text-sm text-muted-foreground">
              No usage data for {formatMonth(year, month)}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
