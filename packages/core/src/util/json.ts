import {
  evidenceRefSchema,
  type EvidenceRef,
  toolUseSchema,
  type ToolUse,
} from "@lifecoach/schemas";

/**
 * Small JSON helpers used by the storage layer's row mappers. SQLite stores
 * string arrays as JSON-encoded TEXT; consumers need to round-trip them
 * defensively because the column was historically untyped.
 */

/**
 * Parse a JSON string into `string[]`, returning `[]` on any malformed input
 * (non-JSON, non-array, mixed types). Filters out non-string elements rather
 * than throwing so a single corrupt row doesn't crash a paginated read.
 */
export const parseStringArray = (raw: string | null | undefined): string[] => {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};

export const parseJsonValue = (raw: string | null | undefined): unknown => {
  if (raw == null || raw === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

export const parseRecord = (
  raw: string | null | undefined,
): Record<string, unknown> | undefined => {
  const parsed = parseJsonValue(raw);
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
};

export const parseEvidenceRefs = (raw: string | null | undefined): EvidenceRef[] => {
  const parsed = parseJsonValue(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((ref): ref is EvidenceRef => evidenceRefSchema.safeParse(ref).success);
};

export const parseToolUse = (raw: string | null | undefined): ToolUse | undefined => {
  const parsed = parseJsonValue(raw);
  const toolUse = toolUseSchema.safeParse(parsed);
  return toolUse.success ? toolUse.data : undefined;
};
