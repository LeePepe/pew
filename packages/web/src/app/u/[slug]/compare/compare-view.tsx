"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar,
  Database,
  DollarSign,
  ShieldCheck,
  Github,
  Zap,
} from "lucide-react";

import { useProfileCompare } from "@/hooks/use-profile-compare";
import { sourceLabel } from "@/hooks/use-usage-data";
import { formatTokens } from "@/lib/utils";
import { formatCost } from "@/hooks/use-pricing";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/leaderboard/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SiteFooter } from "@/components/layout/site-footer";
import { StatGrid } from "@/components/dashboard/stat-card";

interface CompareViewProps {
  slug: string;
}

interface CompareMetricCardProps {
  title: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  viewedValue: string;
  yourValue: string;
  deltaLabel: string;
}

function CompareMetricCard({
  title,
  icon: Icon,
  viewedValue,
  yourValue,
  deltaLabel,
}: CompareMetricCardProps) {
  return (
    <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <p className="text-xs md:text-sm text-muted-foreground">{title}</p>
        <div className="rounded-md bg-card p-2 text-muted-foreground">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Viewed</span>
          <span className="font-medium text-foreground">{viewedValue}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">You</span>
          <span className="font-medium text-foreground">{yourValue}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{deltaLabel}</p>
    </div>
  );
}

function formatDelta(delta: number, formatter: (value: number) => string): string {
  if (delta === 0) return "Equal";
  if (delta > 0) return `You +${formatter(delta)}`;
  return `Viewed +${formatter(Math.abs(delta))}`;
}

function CompareViewSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      <StatGrid columns={3}>
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </StatGrid>
      <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
        <Skeleton className="mb-4 h-5 w-32" />
        <Skeleton className="h-[180px] w-full" />
      </div>
      <div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
        <Skeleton className="mb-4 h-5 w-36" />
        <Skeleton className="h-[220px] w-full" />
      </div>
    </div>
  );
}

export function CompareView({ slug }: CompareViewProps) {
  const { data, loading, error, notFound, hasAnyData } = useProfileCompare({ slug, days: 30 });

  if (notFound) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background">
        <div className="absolute right-6 top-4 z-50 flex items-center gap-1">
          <a
            href="/privacy"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-[color] duration-200 hover:text-foreground"
            aria-label="Privacy policy"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </a>
          <a
            href="https://github.com/nocoo/pew"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-[color] duration-200 hover:text-foreground"
            aria-label="View source on GitHub"
          >
            <Github className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </a>
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col px-6">
          <PageHeader>
            <h1 className="tracking-tight text-foreground">
              <span className="text-[36px] font-bold font-handwriting leading-none mr-2">pew</span>
              <span className="text-[19px] font-normal text-muted-foreground">Compare</span>
            </h1>
          </PageHeader>
          <main className="flex-1 py-8">
            <div className="space-y-4 text-center">
              <h2 className="text-4xl font-bold font-display text-foreground">404</h2>
              <p className="text-muted-foreground">No public profile found for &ldquo;{slug}&rdquo;</p>
              <Link
                href="/leaderboard"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to leaderboard
              </Link>
            </div>
          </main>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background">
        <div className="absolute right-6 top-4 z-50 flex items-center gap-1">
          <a
            href="/privacy"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-[color] duration-200 hover:text-foreground"
            aria-label="Privacy policy"
          >
            <ShieldCheck className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </a>
          <a
            href="https://github.com/nocoo/pew"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-[color] duration-200 hover:text-foreground"
            aria-label="View source on GitHub"
          >
            <Github className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </a>
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col px-6">
          <PageHeader>
            <h1 className="tracking-tight text-foreground">
              <span className="text-[36px] font-bold font-handwriting leading-none mr-2">pew</span>
              <span className="text-[19px] font-normal text-muted-foreground">Compare</span>
            </h1>
          </PageHeader>
          <main className="flex-1 py-8">
            <div className="space-y-4 text-center">
              <p className="text-destructive">Failed to load compare data: {error}</p>
              <Link
                href={`/u/${slug}`}
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to profile
              </Link>
            </div>
          </main>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="absolute right-6 top-4 z-50 flex items-center gap-1">
        <a
          href="/privacy"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-[color] duration-200 hover:text-foreground"
          aria-label="Privacy policy"
        >
          <ShieldCheck className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </a>
        <a
          href="https://github.com/nocoo/pew"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-[color] duration-200 hover:text-foreground"
          aria-label="View source on GitHub"
        >
          <Github className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </a>
        <ThemeToggle />
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 flex flex-col px-6">
        <PageHeader>
          <h1 className="tracking-tight text-foreground">
            <span className="text-[36px] font-bold font-handwriting leading-none mr-2">pew</span>
            <span className="text-[19px] font-normal text-muted-foreground">Compare</span>
          </h1>
        </PageHeader>

        <main className="flex-1 py-4 space-y-4 md:space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground">Profile Comparison</h2>
              {data && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Viewed user vs you, {data.window.from} to {data.window.to}
                </p>
              )}
            </div>
            <Link
              href={`/u/${slug}`}
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to profile
            </Link>
          </div>

          {loading && <CompareViewSkeleton />}

          {!loading && data && (
            <>
              <StatGrid columns={3}>
                <CompareMetricCard
                  title="Total Tokens"
                  icon={Zap}
                  viewedValue={formatTokens(data.summary.totalTokens.a)}
                  yourValue={formatTokens(data.summary.totalTokens.b)}
                  deltaLabel={formatDelta(data.summary.totalTokens.delta, formatTokens)}
                />
                <CompareMetricCard
                  title="Input Tokens"
                  icon={ArrowDownToLine}
                  viewedValue={formatTokens(data.summary.inputTokens.a)}
                  yourValue={formatTokens(data.summary.inputTokens.b)}
                  deltaLabel={formatDelta(data.summary.inputTokens.delta, formatTokens)}
                />
                <CompareMetricCard
                  title="Output Tokens"
                  icon={ArrowUpFromLine}
                  viewedValue={formatTokens(data.summary.outputTokens.a)}
                  yourValue={formatTokens(data.summary.outputTokens.b)}
                  deltaLabel={formatDelta(data.summary.outputTokens.delta, formatTokens)}
                />
                <CompareMetricCard
                  title="Cached Tokens"
                  icon={Database}
                  viewedValue={formatTokens(data.summary.cachedTokens.a)}
                  yourValue={formatTokens(data.summary.cachedTokens.b)}
                  deltaLabel={formatDelta(data.summary.cachedTokens.delta, formatTokens)}
                />
                <CompareMetricCard
                  title="Est. Cost"
                  icon={DollarSign}
                  viewedValue={formatCost(data.summary.estimatedCost.a)}
                  yourValue={formatCost(data.summary.estimatedCost.b)}
                  deltaLabel={formatDelta(data.summary.estimatedCost.delta, formatCost)}
                />
                <CompareMetricCard
                  title="Active Days"
                  icon={Calendar}
                  viewedValue={String(data.summary.activeDays.a)}
                  yourValue={String(data.summary.activeDays.b)}
                  deltaLabel={formatDelta(data.summary.activeDays.delta, (n) => String(n))}
                />
              </StatGrid>

              {!hasAnyData && (
                <div className="rounded-[var(--radius-card)] bg-secondary p-6 text-center text-sm text-muted-foreground">
                  No usage in this comparison window.
                </div>
              )}

              <section className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
                <h3 className="mb-4 text-lg font-semibold text-foreground">Source Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Source</th>
                        <th className="pb-2 pr-4 text-right font-medium">Viewed</th>
                        <th className="pb-2 pr-4 text-right font-medium">You</th>
                        <th className="pb-2 text-right font-medium">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sources.map((row) => (
                        <tr key={row.source} className="border-b border-border/30 last:border-b-0">
                          <td className="py-2 pr-4 text-foreground">{row.label}</td>
                          <td className="py-2 pr-4 text-right text-foreground">{formatTokens(row.a)}</td>
                          <td className="py-2 pr-4 text-right text-foreground">{formatTokens(row.b)}</td>
                          <td className="py-2 text-right text-muted-foreground">
                            {formatDelta(row.delta, formatTokens)}
                          </td>
                        </tr>
                      ))}
                      {data.sources.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-muted-foreground">
                            No source data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
                <h3 className="mb-4 text-lg font-semibold text-foreground">Model Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Model</th>
                        <th className="pb-2 pr-4 font-medium">Source</th>
                        <th className="pb-2 pr-4 text-right font-medium">Viewed</th>
                        <th className="pb-2 pr-4 text-right font-medium">You</th>
                        <th className="pb-2 text-right font-medium">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.map((row) => (
                        <tr
                          key={`${row.source}::${row.model}`}
                          className="border-b border-border/30 last:border-b-0"
                        >
                          <td className="py-2 pr-4 text-foreground">{row.model}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{sourceLabel(row.source)}</td>
                          <td className="py-2 pr-4 text-right text-foreground">
                            {formatTokens(row.aTotal)}
                          </td>
                          <td className="py-2 pr-4 text-right text-foreground">
                            {formatTokens(row.bTotal)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {formatDelta(row.delta, formatTokens)}
                          </td>
                        </tr>
                      ))}
                      {data.models.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-3 text-center text-muted-foreground">
                            No model data.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}

