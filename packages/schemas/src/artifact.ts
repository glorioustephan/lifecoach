import { z } from "zod";

/**
 * How an artifact came to exist:
 *  - conversation: the user pressed "Save <type>" under an agent reply
 *  - cron:         the daily extraction pass surfaced it from past conversations
 *  - manual:       created/edited directly
 */
export const artifactOrigin = z.enum(["conversation", "cron", "manual"]);
export type ArtifactOrigin = z.infer<typeof artifactOrigin>;

/**
 * Semantic badge color keys. These map to existing theme tokens on the web
 * (see packages/web/src/components/ui/Badge.tsx) rather than raw Tailwind
 * palette colors, so artifacts stay consistent with the rest of the UI in
 * both dark and light themes.
 */
export const artifactBadgeColor = z.enum([
  "accent",
  "warning",
  "success",
  "destructive",
  "neutral",
]);
export type ArtifactBadgeColor = z.infer<typeof artifactBadgeColor>;

export const artifactSchema = z.object({
  id: z.string(),
  /** Plugin id, e.g. "recipe". */
  type: z.string().min(1),
  title: z.string().min(1),
  /** Standardized Markdown body produced by the type's formatter. */
  body: z.string(),
  /** Optional coarse classification (separate from freeform tags). */
  category: z.string().nullable().optional(),
  /** Freeform classification tags rendered as colored badges. */
  tags: z.array(z.string()).default([]),
  /** Extraction confidence (0–1) when LLM-extracted; null for manual edits. */
  confidence: z.number().min(0).max(1).nullable().optional(),
  origin: artifactOrigin.default("manual"),
  sourceSessionId: z.string().nullable().optional(),
  sourceMessageIds: z.array(z.string()).default([]),
  /** Set when the artifact was extracted from an ingested document rather than a conversation. */
  sourceDocumentId: z.string().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const newArtifactSchema = artifactSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NewArtifact = z.infer<typeof newArtifactSchema>;

/**
 * A pure, no-LLM description of an artifact type. Lives in the shared package
 * so both the web (button visibility + badge color) and core (cron pre-filter)
 * reuse a single definition — the detection heuristic is never duplicated.
 *
 * The heavy LLM extraction schema + Markdown formatter live alongside this in
 * the core plugin module (packages/core/src/artifacts/plugins/*), keyed by the
 * same `id`.
 */
export interface ArtifactTypeDescriptor {
  id: string;
  label: string;
  badgeColor: ArtifactBadgeColor;
  /**
   * Cheap heuristic: does this text plausibly contain this artifact type?
   * Must not call out to any service — it gates whether we spend tokens at all.
   */
  detect: (text: string) => boolean;
}

const recipeDetect = (text: string): boolean => {
  const lower = text.toLowerCase();
  const hasIngredients =
    /(^|\n)\s*#{0,6}\s*ingredients\b/.test(lower) || /\bingredients?\s*:/.test(lower);
  const hasMethod =
    /(^|\n)\s*#{0,6}\s*(instructions|steps|directions|method|preparation)\b/.test(lower) ||
    /(^|\n)\s*\d+[.)]\s+\S/.test(text); // a numbered list
  return hasIngredients && hasMethod;
};

const spendingAlertDetect = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    /(over\s*budget|spending\s*(too\s*much|spike|increase)|budget\s*(exceeded|overage)|category.{0,30}(over|exceed))/.test(lower)
  );
};

const debtPayoffDetect = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    /(credit\s*card.{0,40}balance|pay\s*(off|down)\s*(debt|loan|card)|debt\s*payoff|payoff\s*plan|interest\s*rate.{0,30}(apr|%))/.test(lower)
  );
};

const cashflowDetect = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    /(savings\s*rate|cash\s*flow|net\s*(income|savings)|runway.{0,20}(month|week)|emergency\s*fund)/.test(lower)
  );
};

const portfolioDetect = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    /(portfolio.{0,30}(allocation|snapshot|value|balance)|unrealized\s*(gain|loss)|(VTI|VXUS|BND|VGRO|VOO|QQQ).{0,20}(percent|%|\$)|holdings\s*(breakdown|by|across))/.test(text)
  );
};

export const ARTIFACT_DESCRIPTORS: ArtifactTypeDescriptor[] = [
  { id: "recipe", label: "Recipe", badgeColor: "warning", detect: recipeDetect },
  { id: "spending-alert", label: "Spending Alert", badgeColor: "warning", detect: spendingAlertDetect },
  { id: "debt-payoff-plan", label: "Debt Payoff Plan", badgeColor: "destructive", detect: debtPayoffDetect },
  { id: "cashflow-summary", label: "Cashflow Summary", badgeColor: "success", detect: cashflowDetect },
  { id: "portfolio-snapshot", label: "Portfolio Snapshot", badgeColor: "accent", detect: portfolioDetect },
];

export const getArtifactDescriptor = (id: string): ArtifactTypeDescriptor | undefined =>
  ARTIFACT_DESCRIPTORS.find((d) => d.id === id);

/** Returns the ids of every artifact type whose heuristic matches `text`. */
export const detectArtifactTypes = (text: string): string[] =>
  ARTIFACT_DESCRIPTORS.filter((d) => d.detect(text)).map((d) => d.id);
