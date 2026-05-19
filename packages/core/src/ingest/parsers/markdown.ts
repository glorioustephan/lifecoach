import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

export interface ParsedDocument {
  title?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parse a Markdown file. Extracts:
 *   - YAML/TOML frontmatter via gray-matter → `metadata`
 *   - First `# heading` (or frontmatter.title, or filename) → `title`
 *   - Everything else → `body` (kept as Markdown source; we don't strip syntax
 *     because preserving links/lists improves recall quality)
 */
export const parseMarkdown = async (filePath: string): Promise<ParsedDocument> => {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const body = parsed.content.trim();

  const fmTitle =
    typeof parsed.data?.["title"] === "string"
      ? (parsed.data["title"] as string)
      : undefined;
  const headingMatch = body.match(/^\s*#\s+(.+?)\s*$/m);
  const title = fmTitle ?? headingMatch?.[1] ?? path.basename(filePath, path.extname(filePath));

  const metadata: Record<string, unknown> | undefined =
    Object.keys(parsed.data ?? {}).length > 0
      ? (parsed.data as Record<string, unknown>)
      : undefined;

  return {
    title,
    body,
    ...(metadata ? { metadata } : {}),
  };
};
