import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach, syncTodoist, syncCapacities } from "@lifecoach/core";

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
        const result = await syncTodoist(lc.todoist, lc.storage, lc.embedder);
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
        const result = await syncCapacities(lc.capacities, lc.storage, lc.embedder, {
          pruneMissing: opts.prune === true,
          ...(opts.terms
            ? {
                searchTerms: opts.terms
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0),
              }
            : {}),
        });
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
};
