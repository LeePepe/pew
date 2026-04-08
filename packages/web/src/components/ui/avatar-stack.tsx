"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface AvatarStackMember {
  id: string;
  name: string | null;
  image: string | null;
}

export interface AvatarStackProps {
  members: AvatarStackMember[];
  /** Maximum number of avatars to show before +N indicator */
  max?: number;
  /** Avatar size */
  size?: "sm" | "default";
  /** Additional class name */
  className?: string;
}

/**
 * Displays a stack of overlapping avatars with a +N indicator for overflow.
 */
export function AvatarStack({
  members,
  max = 4,
  size = "default",
  className,
}: AvatarStackProps) {
  const displayMembers = members.slice(0, max);
  const overflow = members.length - max;

  // Size-based styles
  const avatarSize = size === "sm" ? "size-6" : "size-8";
  const overlapMargin = size === "sm" ? "-ml-2" : "-ml-3";
  const overflowSize = size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";

  return (
    <div className={cn("flex items-center", className)}>
      {displayMembers.map((member, index) => (
        <Avatar
          key={member.id}
          size={size}
          className={cn(
            "ring-2 ring-background",
            index > 0 && overlapMargin,
            avatarSize
          )}
        >
          {member.image && <AvatarImage src={member.image} alt={member.name ?? "Member"} />}
          <AvatarFallback>
            {member.name?.charAt(0).toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
      ))}

      {overflow > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium ring-2 ring-background",
            overlapMargin,
            overflowSize
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
