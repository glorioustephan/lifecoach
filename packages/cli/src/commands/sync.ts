import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import {
  createLifecoach,
  syncTodoist,
  syncCapacities,
  MonarchClient,
  syncMonarch,
  buildMonarchClientFromProfile,
  recordMonarchSync,
  recordMonarchError,
} from "@lifecoach/core";

export const registerSync = (program: Command): void => {
  const sync = program
    .command("sync")
    .description("Pull data from configured external sources into local memory");

  sync
    .command("todoist")
    .description("Mirror active Todoist tasks (+ reconcile completed) into the local DB")
    .action(async () => {
      const lc = createLifecoach();
      if (!lc.todoist) {
        console.error(
          chalk.red("TODOIST_API_TOKEN is not set. Add it to your .env file."),
        );
        console.error(
          chalk.dim(
            "  Get a token at: Todoist → Settings → Integrations → Developer → API token",
          ),
        );
        lc.close();
        process.exitCode = 1;
        return;
      }
      const spinner = ora({ text: "syncing Todoist…", color: "cyan" }).start();
      try {
        const todoist = lc.todoist;
        const run = await lc.storage.jobs.run("sync.todoist", async () =>
          syncTodoist(todoist, lc.storage, lc.embedder),
        );
        if (run.status === "skipped") {
          spinner.succeed(`Todoist sync already running (${run.activeRunId}).`);
          return;
        }
        const result = run.result;
        spinner.succeed(
          `Todoist sync — ${result.fetched} fetched, ${result.upserted} upserted, ${result.newlyCompleted} newly completed, ${result.embedded} embedded`,
        );
      } catch (err) {
        spinner.fail("sync failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });

  sync
    .command("capacities")
    .description(
      "Sweep Capacities spaces, mirror discovered objects (title + type + URL) as documents, embed for recall",
    )
    .option(
      "--prune",
      "Delete locally-mirrored objects that didn't surface in this sweep. Off by default — Capacities has no real enumeration endpoint, so absence ≠ deletion. Only safe once your sweep terms cover your titles exhaustively.",
    )
    .option(
      "--terms <terms>",
      "Comma-separated lookup terms to use instead of the default a–z + 0–9 + structure plural names",
    )
    .action(async (opts: { prune?: boolean; terms?: string }) => {
      const lc = createLifecoach();
      if (!lc.capacities) {
        console.error(
          chalk.red("CAPACITIES_API_TOKEN is not set. Add it to your .env file."),
        );
        console.error(
          chalk.dim(
            "  Get a token: Capacities desktop app → Settings → Capacities API → Generate token",
          ),
        );
        lc.close();
        process.exitCode = 1;
        return;
      }
      const spinner = ora({ text: "sweeping Capacities…", color: "cyan" }).start();
      try {
        const capacities = lc.capacities;
        const run = await lc.storage.jobs.run("sync.capacities", async () =>
          syncCapacities(capacities, lc.storage, lc.embedder, {
            pruneMissing: opts.prune === true,
            ...(opts.terms
              ? {
                  searchTerms: opts.terms
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0),
                }
              : {}),
          }),
        );
        if (run.status === "skipped") {
          spinner.succeed(`Capacities sync already running (${run.activeRunId}).`);
          return;
        }
        const result = run.result;
        spinner.succeed(
          `Capacities sync — ${result.spacesScanned} space(s), ${result.structuresIndexed} structure(s), ${result.objectsDiscovered} object(s) via ${result.searchTermsUsed} lookups`,
        );
        console.log(
          chalk.dim(
            `  · ${result.upserted} documents upserted · ${result.embedded} embedded`,
          ),
        );
        if (result.factsRouted + result.projectsRouted > 0) {
          console.log(
            chalk.dim(
              `  · type-aware: ${result.factsRouted} facts (Person/Recipe) · ${result.projectsRouted} projects`,
            ),
          );
        }
        if (result.removed > 0) {
          console.log(chalk.dim(`  · ${result.removed} stale rows pruned`));
        }
      } catch (err) {
        spinner.fail("sync failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });

  sync
    .command("financial")
    .description("Sync financial data from Monarch Money API")
    .action(async () => {
      const lc = createLifecoach();
      const spinner = ora({ text: "syncing Monarch financial data…", color: "cyan" }).start();
      try {
        // Prefer credentials saved via Settings (encrypted at rest); fall back to
        // a persisted session or MONARCH_* env vars for headless/legacy setups.
        let client = await buildMonarchClientFromProfile({
          storage: lc.storage,
          config: lc.config,
        });
        if (!client) {
          const monarchSessionFile = lc.config.monarchSessionFile || ".mm/mm_session.json";
          const envClient = new MonarchClient(monarchSessionFile);
          const sessionLoaded = await envClient.loadSession();
          if (!sessionLoaded) {
            const { monarchEmail, monarchPassword, monarchMfaSecret } = lc.config;
            if (!monarchEmail || !monarchPassword) {
              spinner.fail("Monarch: no saved credentials, no active session, no env credentials.");
              console.error(
                chalk.dim(
                  "  Connect in Settings → Sources, or add MONARCH_EMAIL and MONARCH_PASSWORD to your .env file.",
                ),
              );
              lc.close();
              process.exitCode = 1;
              return;
            }
            spinner.text = "Authenticating with Monarch Money…";
            await envClient.authenticate(monarchEmail, monarchPassword, monarchMfaSecret);
          }
          client = envClient;
        }

        const activeClient = client;
        const run = await lc.storage.jobs.run("sync.monarch", async () => {
          const result = await syncMonarch(activeClient, lc.storage, {
            semantic: lc.memory.semantic,
          });
          recordMonarchSync(lc.storage);
          // Financial insights are now produced by the unified Insighter on its
          // own daily cron (07:30) — we no longer kick them off from sync.
          return result;
        });
        if (run.status === "skipped") {
          spinner.succeed(`Monarch sync already running (${run.activeRunId}).`);
          return;
        }
        const result = run.result;
        spinner.succeed(
          `Monarch sync — ${result.accountsUpserted} accounts, ${result.transactionsUpserted} transactions, ${result.holdingsSnapshotted} holdings`,
        );
      } catch (err) {
        recordMonarchError(lc.storage, err instanceof Error ? err.message : String(err));
        spinner.fail("sync failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });
};
