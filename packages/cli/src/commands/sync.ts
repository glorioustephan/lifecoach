import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach, syncTodoist } from "@lifecoach/core";

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
        const result = await syncTodoist(lc.todoist, lc.storage);
        spinner.succeed(
          `Todoist sync complete — ${result.fetched} active tasks fetched, ${result.upserted} upserted, ${result.newlyCompleted} newly marked completed`,
        );
      } catch (err) {
        spinner.fail("sync failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });
};
