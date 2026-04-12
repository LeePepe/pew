import type { BadgeShape } from "@pew/core";

// ---------------------------------------------------------------------------
// Badge Icon Component
// ---------------------------------------------------------------------------

interface BadgeIconProps {
  text: string; // 1-3 chars
  shape: BadgeShape;
  colorBg: string; // hex
  colorText: string; // hex
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Size configuration for badge dimensions.
 *
 * sm: Compact size for inline use (profile popup, lists)
 * md: Standard size for leaderboard rank position
 * lg: Large size for admin previews
 */
const SIZE_CONFIG = {
  sm: { container: 20, font: 8 },
  md: { container: 24, font: 10 },
  lg: { container: 32, font: 14 },
} as const;

/**
 * SVG path definitions for each badge shape.
 * All paths are designed for a 24x24 viewBox and scaled proportionally.
 */
const SHAPE_PATHS: Record<BadgeShape, string> = {
  // Shield: classic badge shape with pointed bottom
  shield:
    "M12 2 L22 6 L22 12 C22 17 17 21 12 23 C7 21 2 17 2 12 L2 6 Z",
  // Star: 5-pointed star
  star: "M12 2 L14.5 9 L22 9 L16 14 L18.5 22 L12 17 L5.5 22 L8 14 L2 9 L9.5 9 Z",
  // Hexagon: 6-sided polygon
  hexagon:
    "M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z",
  // Circle: simple round badge
  circle: "M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2",
  // Diamond: rotated square
  diamond: "M12 2 L22 12 L12 22 L2 12 Z",
};

/**
 * Badge icon component for displaying admin-assigned badges.
 *
 * Used in:
 * - Leaderboard rank column (replaces position number when user has active badge)
 * - Profile popup (next to avatar, shows all active badges)
 * - Admin badge management (preview in create/list views)
 */
export function BadgeIcon({
  text,
  shape,
  colorBg,
  colorText,
  size = "md",
  className = "",
}: BadgeIconProps) {
  const { container, font } = SIZE_CONFIG[size];

  return (
    <svg
      width={container}
      height={container}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={`Badge: ${text}`}
    >
      {/* Background shape */}
      <path d={SHAPE_PATHS[shape]} fill={colorBg} />

      {/* Text overlay - centered */}
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fill={colorText}
        fontSize={font}
        fontWeight="600"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export type { BadgeIconProps };
