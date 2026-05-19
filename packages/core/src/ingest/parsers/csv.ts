import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import type { ParsedDocument } from "./markdown.js";

/**
 * Parse a CSV file. Produces a flat textual body representation that's
 * embedding-friendly: one row per line, formatted as `key: value, key: value, ...`
 * when headers exist, or as a tab-joined row otherwise.
 *
 * For lab/health-tracker CSVs the row-per-line format gives reasonable recall
 * even before we add a structured measurement extractor (Phase 1.2).
 */
export const parseCsv = async (filePath: string): Promise<ParsedDocument> => {
  const raw = await fs.readFile(filePath, "utf8");
  const result = Papa.parse(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = (result.data as Record<string, unknown>[]) ?? [];
  const lines: string[] = [];

  if (rows.length === 0) {
    return { title: path.basename(filePath, path.extname(filePath)), body: "" };
  }

  // Heuristic: if the parsed rows look like { col1, col2, ... } headers
  // (i.e. keys are non-numeric), use `header: value` formatting.
  const sampleKeys = Object.keys(rows[0] ?? {});
  const hasNamedHeaders = sampleKeys.some((k) => Number.isNaN(Number(k)));

  for (const row of rows) {
    if (hasNamedHeaders) {
      const parts = Object.entries(row)
        .filter(([, v]) => v !== "" && v != null)
        .map(([k, v]) => `${k}: ${String(v)}`);
      if (parts.length > 0) lines.push(parts.join(", "));
    } else {
      lines.push(Object.values(row).map(String).join("\t"));
    }
  }

  return {
    title: path.basename(filePath, path.extname(filePath)),
    body: lines.join("\n"),
    metadata: {
      columns: sampleKeys,
      rowCount: rows.length,
    },
  };
};
