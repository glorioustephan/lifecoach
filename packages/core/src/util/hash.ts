import crypto from "node:crypto";
import fs from "node:fs";

/**
 * Stream-hash a file with SHA-256. Used by the ingest pipeline + watcher to
 * dedupe identical content (same file dropped twice, file moved + re-dropped).
 */
export const sha256File = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
