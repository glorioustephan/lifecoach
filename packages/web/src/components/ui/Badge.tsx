import { cn } from "~/lib/cn";
import {
  ARTIFACT_DESCRIPTORS,
  getArtifactDescriptor,
  type ArtifactBadgeColor,
} from "@lifecoach/schemas";

// ─── Color mapping ────────────────────────────────────────────────────────────

export const BADGE_COLOR: Record<ArtifactBadgeColor, string> = {
  accent: "bg-accent/10 text-accent border border-accent/30",
  warning: "bg-warning-500/10 text-warning-200 border border-warning-500/20",
  success: "bg-success-500/10 text-success-200 border border-success-500/20",
  destructive: "bg-destructive-500/10 text-destructive-300 border border-destructive-500/20",
  neutral: "bg-surface-elevated text-fg-faint border border-border",
};

const BASE = "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide";
// Freeform tags read better in their natural case (e.g. "30-min", "vegetarian").
const TAG_BASE = "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] tracking-wide";

// ─── TypeBadge ────────────────────────────────────────────────────────────────

interface TypeBadgeProps {
  type: string;
}

export const TypeBadge = ({ type }: TypeBadgeProps): JSX.Element => {
  const descriptor = getArtifactDescriptor(type);
  const label = descriptor?.label ?? type;
  const color = descriptor?.badgeColor ?? "neutral";
  return (
    <span className={cn(BASE, BADGE_COLOR[color])}>{label}</span>
  );
};

// ─── TagBadge ─────────────────────────────────────────────────────────────────

// Tags are decorative, not semantic — keep them to the neutral/accent family so a
// tag like "dinner" never renders in alarming red. warning/success/destructive
// stay reserved for TypeBadge's actual semantics.
const TAG_COLORS: ArtifactBadgeColor[] = ["neutral", "accent"];

/** Deterministically map a tag string to a safe palette key (stable per tag). */
const tagColor = (tag: string): ArtifactBadgeColor => {
  let sum = 0;
  for (let i = 0; i < tag.length; i++) sum += tag.charCodeAt(i);
  return TAG_COLORS[sum % TAG_COLORS.length]!;
};

interface TagBadgeProps {
  tag: string;
}

export const TagBadge = ({ tag }: TagBadgeProps): JSX.Element => (
  <span className={cn(TAG_BASE, BADGE_COLOR[tagColor(tag)])}>{tag}</span>
);
