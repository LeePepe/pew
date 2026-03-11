"use client";

import {
  Flame,
  Trophy,
  Zap,
  DollarSign,
  Calendar,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AchievementState, AchievementTier } from "@/lib/achievement-helpers";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Flame,
  Trophy,
  Zap,
  DollarSign,
  Calendar,
  Shield,
};

// ---------------------------------------------------------------------------
// Tier color system
// ---------------------------------------------------------------------------

/** Tier → Tailwind classes for the ring stroke and glow. */
const TIER_STYLES: Record<AchievementTier, {
  ring: string;      // SVG stroke class
  glow: string;      // CSS glow/shadow class on outer container
  icon: string;      // Icon color class
  bg: string;        // Background of inner circle
  label: string;     // Text color for tier label
}> = {
  locked: {
    ring: "stroke-muted-foreground/20",
    glow: "",
    icon: "text-muted-foreground/40",
    bg: "bg-muted/50",
    label: "text-muted-foreground",
  },
  bronze: {
    ring: "stroke-chart-7",
    glow: "",
    icon: "text-chart-7",
    bg: "bg-chart-7/10",
    label: "text-chart-7",
  },
  silver: {
    ring: "stroke-chart-2",
    glow: "",
    icon: "text-chart-2",
    bg: "bg-chart-2/10",
    label: "text-chart-2",
  },
  gold: {
    ring: "stroke-chart-6",
    glow: "shadow-[0_0_12px_hsl(var(--chart-6)/0.3)]",
    icon: "text-chart-6",
    bg: "bg-chart-6/10",
    label: "text-chart-6",
  },
  diamond: {
    ring: "stroke-primary",
    glow: "shadow-[0_0_16px_hsl(var(--primary)/0.4)]",
    icon: "text-primary",
    bg: "bg-primary/10",
    label: "text-primary",
  },
};

// ---------------------------------------------------------------------------
// Progress Ring SVG
// ---------------------------------------------------------------------------

const RING_SIZE = 72;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface ProgressRingProps {
  progress: number;
  tier: AchievementTier;
  className?: string;
  children: React.ReactNode;
}

function ProgressRing({ progress, tier, className, children }: ProgressRingProps) {
  const offset = RING_CIRCUMFERENCE * (1 - progress);
  const styles = TIER_STYLES[tier];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
      >
        {/* Background track */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-muted-foreground/10"
        />
        {/* Progress arc */}
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={cn(styles.ring, "transition-[stroke-dashoffset] duration-700 ease-out")}
        />
      </svg>
      {/* Icon in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AchievementBadge
// ---------------------------------------------------------------------------

export interface AchievementBadgeProps {
  achievement: AchievementState;
  className?: string;
}

/**
 * Single achievement badge with progress ring, tier-colored icon, and tooltip.
 *
 * Visual states:
 * - Locked: grey, faded icon, progress toward first tier
 * - Bronze/Silver: colored ring + icon, no glow
 * - Gold: colored + subtle glow
 * - Diamond: primary color + strong glow
 */
export function AchievementBadge({ achievement, className }: AchievementBadgeProps) {
  const Icon = ICON_MAP[achievement.icon];
  const styles = TIER_STYLES[achievement.tier];
  const isLocked = achievement.tier === "locked";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl p-3 transition-all",
              styles.glow,
              className,
            )}
          >
            <ProgressRing progress={achievement.progress} tier={achievement.tier}>
              <div
                className={cn(
                  "flex items-center justify-center rounded-full",
                  styles.bg,
                  "h-[52px] w-[52px]",
                )}
              >
                {Icon && (
                  <Icon
                    className={cn("h-6 w-6", styles.icon)}
                    strokeWidth={1.5}
                  />
                )}
              </div>
            </ProgressRing>
            <span
              className={cn(
                "text-[11px] font-medium leading-tight text-center",
                isLocked ? "text-muted-foreground/60" : "text-foreground",
              )}
            >
              {achievement.name}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px] text-center">
          <p className="font-medium">{achievement.name}</p>
          <p className="mt-0.5 text-[11px] opacity-80">
            {isLocked
              ? `${achievement.displayValue} / ${achievement.displayThreshold} ${achievement.unit}`
              : `${achievement.tierLabel} — ${achievement.displayValue}`}
          </p>
          {!isLocked && achievement.tier !== "diamond" && (
            <p className="mt-0.5 text-[11px] opacity-60">
              Next: {achievement.displayThreshold} {achievement.unit}
            </p>
          )}
          {achievement.tier === "diamond" && (
            <p className="mt-0.5 text-[11px] opacity-60">Max tier reached!</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// AchievementShelf
// ---------------------------------------------------------------------------

export interface AchievementShelfProps {
  achievements: AchievementState[];
  className?: string;
}

/**
 * Grid of achievement badges.
 * Responsive: 3 columns on mobile, 6 on desktop (one per badge).
 */
export function AchievementShelf({ achievements, className }: AchievementShelfProps) {
  if (achievements.length === 0) return null;

  return (
    <div className={cn("rounded-[var(--radius-card)] bg-secondary p-4 md:p-5", className)}>
      <p className="mb-3 text-xs md:text-sm text-muted-foreground">Achievements</p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {achievements.map((ach) => (
          <AchievementBadge key={ach.id} achievement={ach} />
        ))}
      </div>
    </div>
  );
}
