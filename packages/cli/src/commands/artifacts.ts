import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import {
  createLifecoach,
  scanArtifacts,
  scanDocumentArtifacts,
  getArtifactSettings,
  recordCronRun,
  MIN_CRON_CONFIDENCE,
  EMPTY_RUN_LIMIT,
} from "@lifecoach/core";
import { getArtifactDescriptor } from "@lifecoach/schemas";

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const registerArtifacts = (program: Command): void => {
  const artifacts = program
    .command("artifacts")
    .description("Reusable artifacts (recipes, …) surfaced from your conversations");

  artifacts
    .command("extract")
    .description("Daily pass: scan recent conversations AND ingested documents, saving high-confidence artifacts")
    .option("--force", "Run even when auto-extract is disabled in settings")
    .option("--backfill", "Scan the entire document corpus (since the beginning), not just recently ingested ones")
    .action(async (opts: { force?: boolean; backfill?: boolean }) => {
      const lc = createLifecoach();
      if (!lc.artifactExtractor) {
        console.error(chalk.red("ANTHROPIC_API_KEY isn't set — artifact extraction can't run."));
        lc.close();
        process.exitCode = 1;
        return;
      }

      const settings = getArtifactSettings(lc.storage);
      if (!settings.enabled && !opts.force) {
        console.log(
          chalk.dim(
            settings.autoDisabled
              ? `Auto-extract is paused (after ${EMPTY_RUN_LIMIT} empty runs). Re-enable it in Settings or pass --force.`
              : "Auto-extract is disabled in Settings. Re-enable it or pass --force.",
          ),
        );
        lc.close();
        return;
      }

      const sinceMs = settings.lastScanAt ?? Date.now() - SEVEN_DAYS;
      const spinner = ora({ text: "scanning conversations for artifacts…", color: "cyan" }).start();
      try {
        const extractor = lc.artifactExtractor;
        const job = await lc.storage.jobs.run(
          "artifacts.extract",
          async () => {
            const result = await scanArtifacts(
              { storage: lc.storage, extractor },
              { sinceMs, minConfidence: MIN_CRON_CONFIDENCE, origin: "cron" },
            );
            // Also sweep ingested documents (recipes living in exported/dropped
            // files, not just chat). Backfill from the beginning on demand.
            const docResult = await scanDocumentArtifacts(
              { storage: lc.storage, extractor },
              {
                sinceMs: opts.backfill ? 0 : sinceMs,
                minConfidence: MIN_CRON_CONFIDENCE,
                origin: "cron",
              },
            );
            const run = recordCronRun(lc.storage, {
              scannedUntil: result.scannedUntil,
              created: result.created.length + docResult.created.length,
            });
            return { result, docResult, run };
          },
          {
            generatedRefs: ({ result, docResult }) =>
              [...result.created, ...docResult.created].map((artifact) => ({
                refType: "artifact",
                refId: artifact.id,
              })),
          },
        );
        if (job.status === "skipped") {
          spinner.succeed(`Artifact extraction already running (${job.activeRunId}).`);
          return;
        }
        const { result, docResult, run } = job.result;
        const allCreated = [...result.created, ...docResult.created];

        if (allCreated.length === 0) {
          spinner.succeed(
            `No new artifacts (${result.sessionsScanned} session(s), ${result.candidateSessions} candidate(s); ` +
              `${docResult.documentsScanned} doc(s), ${docResult.candidateDocuments} candidate(s)). ` +
              `Empty-run streak: ${run.emptyStreak}/${EMPTY_RUN_LIMIT}.`,
          );
          if (run.autoDisabled) {
            console.log(
              chalk.yellow(
                `Auto-extract paused after ${EMPTY_RUN_LIMIT} empty runs — re-enable in Settings.`,
              ),
            );
          }
        } else {
          spinner.succeed(
            `Saved ${allCreated.length} artifact(s) — ${result.created.length} from ${result.candidateSessions} session(s), ` +
              `${docResult.created.length} from ${docResult.candidateDocuments} document(s).`,
          );
          for (const a of allCreated) {
            const label = getArtifactDescriptor(a.type)?.label ?? a.type;
            console.log(`${chalk.dim(`[${label}]`)} ${chalk.bold(a.title)}`);
          }
        }
      } catch (err) {
        spinner.fail("extraction failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });

  artifacts
    .command("list")
    .description("Show recent artifacts")
    .option("--type <type>", "Filter by type, e.g. recipe")
    .option("--limit <n>", "Max rows", "20")
    .action((opts: { type?: string; limit: string }) => {
      const lc = createLifecoach();
      try {
        const { items, total } = lc.storage.artifacts.list({
          ...(opts.type ? { type: opts.type } : {}),
          limit: Number(opts.limit) || 20,
        });
        if (items.length === 0) {
          console.log(chalk.dim("(none)"));
          return;
        }
        console.log(chalk.dim(`${items.length} of ${total} artifact(s)`));
        for (const a of items) {
          const label = getArtifactDescriptor(a.type)?.label ?? a.type;
          console.log();
          console.log(
            `${chalk.dim(`[${label}]`)} ${chalk.bold(a.title)}  ${chalk.dim(a.id.slice(0, 8))}`,
          );
          if (a.tags.length > 0) console.log(chalk.dim("  #" + a.tags.join(" #")));
        }
      } finally {
        lc.close();
      }
    });
};
