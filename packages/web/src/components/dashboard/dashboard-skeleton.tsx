import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid } from "./stat-card";
import { DashboardSegment } from "./dashboard-segment";
import { ChevronRight } from "lucide-react";

/** Loading skeleton for the dashboard overview. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* ── Achievements (collapsed skeleton — matches real layout) ── */}
      <section className="space-y-3 md:space-y-4">
        <div className="flex items-center gap-3">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <h2 className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Achievements
          </h2>
          <div className="h-px flex-1 bg-border/60" />
        </div>
      </section>

      {/* ── Overview ────────────────────────────────────── */}
      <DashboardSegment title="Overview">
        {/* Row 1 — Core metrics skeleton (4 cols) */}
        <StatGrid columns={4}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5 space-y-3"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </StatGrid>

        {/* Row 2 — Economy metrics skeleton (4 cols) */}
        <StatGrid columns={4}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`econ-${i}`}
              className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5 space-y-3"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </StatGrid>
      </DashboardSegment>

      {/* ── Trends ──────────────────────────────────────── */}
      <DashboardSegment title="Trends">
        {/* Charts — left: tab toggle + trend + cache, right: donut + io ratio */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 md:gap-4">
          {/* Left column */}
          <div className="flex flex-col gap-3 md:gap-4">
            <div>
              <Skeleton className="h-8 w-36 mb-3 rounded-lg" />
              <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
                <Skeleton className="h-3 w-24 mb-4" />
                <Skeleton className="h-[240px] md:h-[280px] w-full" />
              </div>
            </div>
            <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
              <Skeleton className="h-3 w-20 mb-4" />
              <Skeleton className="h-[200px] md:h-[240px] w-full" />
            </div>
          </div>
          {/* Right column */}
          <div className="flex flex-col gap-3 md:gap-4">
            <div className="hidden lg:block h-[28px] shrink-0" />
            <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
              <Skeleton className="h-3 w-20 mb-4" />
              <div className="flex justify-center">
                <Skeleton className="h-[180px] w-[180px] rounded-full" />
              </div>
            </div>
            <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
              <Skeleton className="h-3 w-20 mb-4" />
              <div className="flex justify-center">
                <Skeleton className="h-[180px] w-[180px] rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </DashboardSegment>

      {/* ── Insights ────────────────────────────────────── */}
      <DashboardSegment title="Insights">
        {/* Bottom row — heatmap + weekday/weekend side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
          <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
            <Skeleton className="h-3 w-24 mb-4" />
            <Skeleton className="h-[120px] w-full" />
          </div>
          <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
            <Skeleton className="h-3 w-28 mb-4" />
            <Skeleton className="h-[180px] w-full" />
          </div>
        </div>
      </DashboardSegment>
    </div>
  );
}
