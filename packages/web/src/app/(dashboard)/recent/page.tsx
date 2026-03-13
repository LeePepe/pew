"use client";

import { useMemo } from "react";
import {
  useUsageData,
  toDailyPoints,
} from "@/hooks/use-usage-data";
import { UsageTrendChart } from "@/components/dashboard/usage-trend-chart";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RecentPage() {
  // Recent: last 72 hours (3 days)
  const recentFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 10);
  }, []);
  const recentTo = useMemo(() => {
    return new Date().toISOString().slice(0, 10);
  }, []);

  const { data, loading, error } = useUsageData({
    from: recentFrom,
    to: recentTo,
    granularity: "day",
  });

  const tzOffset = useMemo(() => new Date().getTimezoneOffset(), []);

  const daily = useMemo(() => {
    return data ? toDailyPoints(data.records, tzOffset) : [];
  }, [data, tzOffset]);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold font-display tracking-tight">Recent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Token usage over the last 72 hours.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--radius-card)] bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load usage data: {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-[var(--radius-card)] bg-secondary p-8">
          <Skeleton className="h-[280px] w-full" />
        </div>
      )}

      {/* Content */}
      {!loading && data && (
        <>
          {data.summary.total_tokens > 0 ? (
            <UsageTrendChart data={daily} />
          ) : (
            <div className="rounded-[var(--radius-card)] bg-secondary p-8 text-center text-sm text-muted-foreground">
              No usage data in the last 72 hours.
            </div>
          )}
        </>
      )}
    </div>
  );
}
