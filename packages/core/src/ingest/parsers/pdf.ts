import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { ParsedDocument } from "./markdown.js";

/**
 * Parse a PDF file into plain text using `pdf-parse` v2 (pdfjs-dist under the hood).
 *
 * Two non-obvious things you don't want to repeat:
 *
 * 1. We allocate a fresh, owned ArrayBuffer for pdfjs (via `Uint8Array(length)
 *    + .set(buffer)`) instead of `new Uint8Array(buffer)`. The latter shares
 *    the underlying ArrayBuffer with Node's Buffer pool; pdfjs's internal
 *    LoopbackPort.postMessage then fails with `DataCloneError: Cannot transfer
 *    object of unsupported type` when it tries to structuredClone the buffer
 *    across its loopback worker boundary.
 *
 * 2. We call getInfo() AFTER getText() sequentially, not in Promise.all.
 *    Running them in parallel on the same PDFParse instance lets pdfjs
 *    attempt to transfer the buffer twice and trips the same DataCloneError.
 */
export const parsePdf = async (filePath: string): Promise<ParsedDocument> => {
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer.length);
  data.set(buffer);

  const parser = new PDFParse({ data });
  try {
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();

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
