export interface ChunkOptions {
  /** Target chunk size in characters. Default 800. */
  size?: number;
  /** Overlap between consecutive chunks. Default 80. */
  overlap?: number;
}

export interface Chunk {
  index: number;
  text: string;
}

/**
 * Split text into roughly-`size`-char chunks with `overlap` carry-over.
 *
 * Strategy:
 *  1. Pre-split on paragraph boundaries (\n\n) to avoid cutting mid-paragraph
 *     whenever paragraphs are smaller than `size`.
 *  2. Pack paragraphs greedily into chunks until adding another would exceed
 *     `size`. Long paragraphs that exceed `size` on their own are sliced by
 *     character with `overlap` carry-over.
 *  3. Each chunk's tail (last `overlap` chars) is prepended to the next chunk
 *     so embeddings preserve some context across boundaries.
 *
 * Why not sentence/token-aware splitting?
 *   For personal-data ingestion (notes, lab PDFs, recipes) char-based is
 *   robust and language-agnostic. We can swap in a smarter splitter later
 *   without changing callers.
 */
export const chunkText = (text: string, opts: ChunkOptions = {}): Chunk[] => {
  const size = opts.size ?? 800;
  const overlap = Math.min(opts.overlap ?? 80, Math.floor(size / 2));
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  // Step 1: split into paragraph-ish units.
  const paragraphs = trimmed
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Step 2: pack into chunks.
  const chunks: string[] = [];
  let buffer = "";

  const flush = (): void => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  const carryOver = (): string => {
    if (chunks.length === 0 || overlap === 0) return "";
    const last = chunks[chunks.length - 1]!;
    return last.length > overlap ? last.slice(-overlap) : last;
  };

  for (const para of paragraphs) {
    if (para.length > size) {
      // Long single paragraph: slice by char with overlap.
      flush();
      let cursor = 0;
      while (cursor < para.length) {
        const end = Math.min(cursor + size, para.length);
        const slice = para.slice(cursor, end);
        const prefix = carryOver();
        chunks.push((prefix ? prefix + "\n" : "") + slice);
        cursor = end;
      }
      continue;
    }

    const candidate = buffer ? buffer + "\n\n" + para : para;
    if (candidate.length > size && buffer.length > 0) {
      flush();
      const prefix = carryOver();
      buffer = prefix ? prefix + "\n\n" + para : para;
    } else {
      buffer = candidate;
    }
  }
  flush();

  return chunks.map((text, index) => ({ index, text }));
};
