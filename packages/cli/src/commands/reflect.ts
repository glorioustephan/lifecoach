import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach, kindWindow } from "@lifecoach/core";

export const registerReflect = (program: Command): void => {
  program
    .command("reflect [kind]")
    .description(
      "Generate a structured reflection over a period. Kind = daily | weekly | monthly. Defaults to daily.",
    )
    .option("--from <ts>", "ISO 8601 timestamp or unix-ms; overrides kind default")
    .option("--to <ts>", "ISO 8601 timestamp or unix-ms; overrides kind default")
    .action(
      async (
        kindArg: string | undefined,
        opts: { from?: string; to?: string },
      ) => {
        const kind = (kindArg ?? "daily") as "daily" | "weekly" | "monthly";
        if (!["daily", "weekly", "monthly"].includes(kind)) {
          console.error(chalk.red(`Invalid kind: ${kind}. Use daily | weekly | monthly.`));
          process.exitCode = 1;
          return;
        }
        const lc = createLifecoach();
        if (!lc.reflector) {
          console.error(
            chalk.red("ANTHROPIC_API_KEY is not set — the reflector can't run."),
          );
          lc.close();
          process.exitCode = 1;
          return;
        }

        const parseTs = (raw: string | undefined): number | null => {
          if (!raw) return null;
          const n = Number(raw);
          if (!Number.isNaN(n) && n > 0) return n;
          const t = Date.parse(raw);
          return Number.isNaN(t) ? null : t;
        };
        const defaults = kindWindow(kind);
        const from = parseTs(opts.from) ?? defaults.from;
        const to = parseTs(opts.to) ?? defaults.to;

        const spinner = ora({ text: `reflecting on ${kind}…`, color: "cyan" }).start();
        try {
          const reflection = await lc.reflector.generate(
            lc.storage,
            lc.memory.identity,
            kind,
            from,
            to,
          );
          spinner.succeed(`Wrote ${kind} reflection ${reflection.id}`);
          console.log(
            chalk.dim(
              `  ${new Date(from).toISOString().slice(0, 10)} → ${new Date(to).toISOString().slice(0, 10)}`,
            ),
          );
          console.log();
          console.log(reflection.body);
        } catch (err) {
          spinner.fail("reflection failed");
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        } finally {
          lc.close();
        }
      },
    );
};
