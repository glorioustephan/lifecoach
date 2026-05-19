import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import chokidar from "chokidar";
import { Command } from "commander";
import { createLifecoach, IngestPipeline } from "@lifecoach/core";

const SUPPORTED_EXT = new Set([".md", ".markdown", ".csv", ".pdf"]);

const supported = (p: string): boolean => SUPPORTED_EXT.has(path.extname(p).toLowerCase());

export const registerWatch = (program: Command): void => {
  program
    .command("watch")
    .description("Watch the data/raw directory and auto-ingest new files (idempotent by file hash)")
    .option("--dir <path>", "Override the watch directory (default: <dataDir>/raw)")
    .option("--no-extract", "Skip LLM-assisted extraction on every ingest")
    .action(async (opts: { dir?: string; extract: boolean }) => {
      const lc = createLifecoach();
      const watchDir = opts.dir
        ? path.resolve(opts.dir)
        : lc.config.rawDir;

      try {
        await fs.mkdir(watchDir, { recursive: true });
      } catch (err) {
        console.error(chalk.red(`Failed to ensure watch dir: ${(err as Error).message}`));
        lc.close();
        process.exit(1);
      }

      const pipeline = new IngestPipeline({
        storage: lc.storage,
        embedder: lc.embedder,
        memory: lc.memory,
        ...(lc.extractor ? { extractor: lc.extractor } : {}),
      });

      console.log(chalk.bold.cyan(`Watching ${watchDir}`));
      console.log(
        chalk.dim(
          "Drop Markdown, CSV, or PDF files here — they'll be auto-ingested. Re-dropping the same file is a no-op (hash-deduped). Ctrl-C to stop.\n",
        ),
      );

      const ingestOne = async (filePath: string): Promise<void> => {
        if (!supported(filePath)) return;
        const rel = path.relative(watchDir, filePath) || path.basename(filePath);
        try {
          const result = await pipeline.ingest(filePath, { extract: opts.extract });
          if (result.skipped) {
            console.log(`${chalk.dim("skip")}  ${rel}  ${chalk.dim(`(already in DB as ${result.document.id})`)}`);
          } else {
            const tag = chalk.green("ok");
            const extras: string[] = [];
            extras.push(`${result.chunkCount} chunk${result.chunkCount === 1 ? "" : "s"}`);
            if (result.factsExtracted > 0) extras.push(`${result.factsExtracted} facts`);
            if (result.measurementsExtracted > 0)
              extras.push(`${result.measurementsExtracted} measurements`);
            console.log(`${tag}   ${rel}  ${chalk.dim("→ " + result.document.id + " (" + extras.join(", ") + ")")}`);
            if (result.extractionError) {
              console.log(chalk.yellow(`      extraction warning: ${result.extractionError}`));
            }
          }
        } catch (err) {
          console.log(`${chalk.red("err")}  ${rel}  ${chalk.dim((err as Error).message)}`);
        }
      };

      const watcher = chokidar.watch(watchDir, {
        ignored: (p) => path.basename(p).startsWith(".") && path.basename(p) !== ".",
        persistent: true,
        ignoreInitial: false,
        // awaitWriteFinish handles partial writes (editor saves, AirDrop, etc.)
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      });

      watcher.on("add", (filePath) => {
        void ingestOne(filePath);
      });
      watcher.on("change", (filePath) => {
        // Changed content gets a new hash → will ingest as a new document.
        void ingestOne(filePath);
      });
      watcher.on("error", (err) => {
        console.error(chalk.red(`watcher error: ${(err as Error).message}`));
      });

      const shutdown = async (): Promise<void> => {
        await watcher.close();
        lc.close();
        console.log(chalk.dim("\nWatcher stopped."));
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Keep the process alive — chokidar holds an event-loop reference but
      // we want a clean shutdown story. Block on a never-resolving promise.
      await new Promise(() => undefined);
    });
};
