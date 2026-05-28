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
