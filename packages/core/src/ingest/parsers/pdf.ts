import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { ParsedDocument } from "./markdown.js";

/**
 * Parse a PDF file into plain text using `pdf-parse` v2 (pdfjs-dist under the hood).
 */
export const parsePdf = async (filePath: string): Promise<ParsedDocument> => {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const [textResult, infoResult] = await Promise.all([
      parser.getText(),
      parser.getInfo(),
    ]);
    const body = (textResult.text ?? "").trim();

    const info = (infoResult.info ?? {}) as Record<string, unknown>;
    const title =
      (typeof info["Title"] === "string" && info["Title"].trim().length > 0
        ? info["Title"].trim()
        : undefined) ?? path.basename(filePath, path.extname(filePath));

    const metadata: Record<string, unknown> = {
      pageCount: textResult.total,
      pdfInfo: info,
    };

    return { title, body, metadata };
  } finally {
    await parser.destroy().catch(() => {});
  }
};
