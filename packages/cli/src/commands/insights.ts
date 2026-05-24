import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach } from "@lifecoach/core";

const PRIORITY_LABEL: Record<number, string> = {
  1: chalk.dim("p3"),
  2: chalk.yellow("p2"),
  3: chalk.red("p1"),
};

export const registerInsights = (program: Command): void => {
  const insights = program
    .command("insights")
    .description("Background-intelligence insights from your data");

  insights
    .command("generate")
    .description("Run the insight loop now")
    .action(async () => {
      const lc = createLifecoach();
      if (!lc.insighter) {
        console.error(chalk.red("ANTHROPIC_API_KEY isn't set — insighter can't run."));
        lc.close();
        process.exitCode = 1;
        return;
      }
      const insighter = lc.insighter;
      const spinner = ora({ text: "scanning your data…", color: "cyan" }).start();
      try {
        const run = await lc.storage.jobs.run(
          "insights.generate",
          async () => insighter.generate(lc.storage, lc.memory.identity),
          {
            generatedRefs: (out) =>
              out.map((insight) => ({ refType: "insight", refId: insight.id })),
          },
        );
        if (run.status === "skipped") {
          spinner.succeed(`Insight generation already running (${run.activeRunId}).`);
          return;
        }
        const out = run.result;
        if (out.length === 0) {
          spinner.succeed("Nothing notable surfaced this pass.");
        } else {
          spinner.succeed(`Surfaced ${out.length} insight${out.length === 1 ? "" : "s"}.`);
          for (const i of out) {
            console.log();
            console.log(`${PRIORITY_LABEL[i.priority] ?? ""} ${chalk.bold(i.topic)}`);
            console.log(i.body);
            if (i.rationale) console.log(chalk.dim("→ " + i.rationale));
          }
        }
      } catch (err) {
        spinner.fail("generation failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });

  insights
    .command("list")
    .description("Show active insights")
    .option("--state <state>", "active | acted | dismissed | snoozed | all", "active")
    .action((opts: { state: string }) => {
      const lc = createLifecoach();
      try {
        const rows = lc.storage.insights.list({
          state: opts.state as "active" | "acted" | "dismissed" | "snoozed" | "all",
          limit: 30,
        });
        if (rows.length === 0) {
          console.log(chalk.dim("(none)"));
          return;
        }
        for (const i of rows) {
          console.log();
          console.log(
            `${PRIORITY_LABEL[i.priority] ?? ""} ${chalk.bold(i.topic)}  ${chalk.dim(i.id.slice(0, 8))}`,
          );
          console.log(chalk.dim(i.body.split("\n")[0]?.slice(0, 200) ?? ""));
        }
      } finally {
        lc.close();
      }
    });
};
