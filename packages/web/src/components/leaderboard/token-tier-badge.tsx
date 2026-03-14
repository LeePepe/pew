import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Token Tier Badge
// ---------------------------------------------------------------------------
// Displays a pill badge indicating the magnitude of total token usage:
//   K  = 1,000+       (muted)
//   M  = 1,000,000+   (primary/teal)
//   B  = 1,000,000,000+ (amber/gold)
// Below 1,000 = nothing rendered.
//
// Designed to sit next to the player name with a tooltip showing the
// full tier description.
// ---------------------------------------------------------------------------

type Tier = "K" | "M" | "B";

interface TierConfig {
  label: string;
  tooltip: string;
  className: string;
}

const TIER_CONFIG: Record<Tier, TierConfig> = {
  K: {
    label: "K",
    tooltip: "Thousands — 1,000+ tokens",
    className: "bg-muted text-muted-foreground",
  },
  M: {
    label: "M",
    tooltip: "Millions — 1,000,000+ tokens",
    className: "bg-primary/15 text-primary",
  },
  B: {
    label: "B",
    tooltip: "Billions — 1,000,000,000+ tokens",
    className: "bg-chart-7/15 text-chart-7",
  },
};

function resolveTier(totalTokens: number): Tier | null {
  if (totalTokens >= 1_000_000_000) return "B";
  if (totalTokens >= 1_000_000) return "M";
  if (totalTokens >= 1_000) return "K";
  return null;
}

export function TokenTierBadge({ totalTokens }: { totalTokens: number }) {
  const tier = resolveTier(totalTokens);
  if (!tier) return null;

  const config = TIER_CONFIG[tier];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full px-1.5 py-px text-[10px] font-bold leading-tight tracking-wide cursor-default",
              config.className,
            )}
          >
            {config.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
