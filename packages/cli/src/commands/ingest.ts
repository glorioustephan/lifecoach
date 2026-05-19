import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach, findWorkspaceRoot, IngestPipeline } from "@lifecoach/core";

export const registerIngest = (program: Command): void => {
  program
    .command("ingest <path>")
    .description("Pipe a file (Markdown, CSV, PDF) through the ingestion pipeline")
    .option("--type <type>", "Force a parser: pdf | csv | markdown | auto", "auto")
    .option("--no-extract", "Skip LLM-assisted fact + measurement extraction")
    .action(async (filePath: string, opts: { type: string; extract: boolean }) => {
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(findWorkspaceRoot(), filePath);

      const lc = createLifecoach();
      const spinner = ora({ text: "preparing…", color: "cyan" }).start();
      try {
        const pipeline = new IngestPipeline({
          storage: lc.storage,
          embedder: lc.embedder,
          memory: lc.memory,
          ...(lc.extractor ? { extractor: lc.extractor } : {}),
        });
        const result = await pipeline.ingest(resolved, {
          type: (opts.type as "pdf" | "csv" | "markdown" | "auto") ?? "auto",
          extract: opts.extract,
          onProgress: (e) => {
            switch (e.phase) {
              case "parse":
                spinner.text = `parsing ${e.path}`;
                break;
              case "chunk":
                spinner.text = `chunked into ${e.count} chunk${e.count === 1 ? "" : "s"}`;
                break;
              case "embed":
                spinner.text = `embedding batch ${e.batch}/${e.totalBatches}`;
                break;
              case "persist":
                spinner.text = `persisting document ${e.documentId}`;
                break;
              case "extract":
                spinner.text = `extracting facts and measurements…`;
                break;
              case "extract-result":
                spinner.text = `extracted ${e.factsExtracted} fact${e.factsExtracted === 1 ? "" : "s"} and ${e.measurementsExtracted} measurement${e.measurementsExtracted === 1 ? "" : "s"}`;
                break;
              case "done":
                spinner.text = `ingested ${e.documentId} (${e.chunkCount} chunks)`;
                break;
            }
          },
        });
        spinner.succeed(`Ingested ${result.document.id}`);
        console.log(chalk.dim(`  title:        ${result.document.title ?? "(none)"}`));
        console.log(chalk.dim(`  mime:         ${result.document.mime ?? "(unknown)"}`));
        console.log(chalk.dim(`  body:         ${result.document.body.length} chars`));
        console.log(chalk.dim(`  chunks:       ${result.chunkCount}`));
        console.log(
          chalk.dim(
            `  embedded:     ${result.embedded ? "yes" : "no (embedder disabled)"}`,
          ),
        );
        console.log(chalk.dim(`  facts:        ${result.factsExtracted}`));
        console.log(chalk.dim(`  measurements: ${result.measurementsExtracted}`));
        if (result.extractionNotes) {
          console.log(chalk.dim(`  notes:        ${result.extractionNotes}`));
        }
        if (result.extractionError) {
          console.log(
            chalk.yellow(`  extraction warning: ${result.extractionError}`),
          );
        }
      } catch (err) {
        spinner.fail("ingest failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });
};
