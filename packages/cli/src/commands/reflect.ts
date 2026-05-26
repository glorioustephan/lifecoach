import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach, kindWindow, pushReflectionToCapacities } from "@lifecoach/core";

export const registerReflect = (program: Command): void => {
  program
    .command("reflect [kind]")
    .description(
      "Generate a structured reflection over a period. Kind = daily | weekly | monthly. Defaults to daily.",
    )
    .option("--from <ts>", "ISO 8601 timestamp or unix-ms; overrides kind default")
    .option("--to <ts>", "ISO 8601 timestamp or unix-ms; overrides kind default")
    .option(
      "--no-capacities",
      "Skip pushing the reflection to Capacities (default: push when CAPACITIES_API_TOKEN + CAPACITIES_DEFAULT_SPACE_ID are set)",
    )
    .action(
      async (
        kindArg: string | undefined,
        opts: { from?: string; to?: string; capacities?: boolean },
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
          const reflector = lc.reflector;
          const run = await lc.storage.jobs.run(
            `reflect.${kind}`,
            async () => {
              // Dedup: if a reflection for this exact window already exists
              // (e.g. a repeated cron fire), reuse it instead of generating —
              // and re-pushing — a duplicate.
              const existing = lc.storage.reflections.findByPeriod(kind, from, to);
              const reflection =
                existing ??
                (await reflector.generate(
                  lc.storage,
                  lc.memory.identity,
                  kind,
                  from,
                  to,
                ));
              if (!existing) {
                await lc.memory.semantic.indexReflection(reflection);
              }

              // Capacities write-back — only attempt for daily/weekly (monthly is
              // typically too long for a daily note entry). Caller can override
              // with --no-capacities. The tracker makes the push idempotent.
              const writebackEligible = (kind === "daily" || kind === "weekly")
                && opts.capacities !== false;
              const writeback = writebackEligible
                ? await pushReflectionToCapacities(reflection, {
                    enabled: true,
                    client: lc.capacities,
                    spaceId: lc.config.capacitiesDefaultSpaceId,
                    tracker: lc.storage.reflections,
                  })
                : null;
              return { reflection, writeback, reused: !!existing };
            },
            {
              generatedRefs: ({ reflection }) => [
                { refType: "reflection", refId: reflection.id },
              ],
            },
          );
          if (run.status === "skipped") {
            spinner.succeed(`Reflection already running (${run.activeRunId}).`);
            return;
          }
          const { reflection, writeback, reused } = run.result;
          spinner.succeed(
            reused
              ? `Reused existing ${kind} reflection ${reflection.id} (already generated for this window)`
              : `Wrote ${kind} reflection ${reflection.id}`,
          );
          console.log(
            chalk.dim(
              `  ${new Date(from).toISOString().slice(0, 10)} → ${new Date(to).toISOString().slice(0, 10)}`,
            ),
          );

          if (writeback) {
            if (writeback.pushed) {
              console.log(chalk.dim("  → pushed to Capacities daily note"));
            } else if (writeback.reason === "already_pushed") {
              console.log(chalk.dim("  · already in Capacities daily note (skipped)"));
            } else if (writeback.reason === "no_default_space") {
              console.log(
                chalk.dim("  · skipped Capacities write-back (CAPACITIES_DEFAULT_SPACE_ID not set)"),
              );
            } else if (writeback.reason === "capacities_not_configured") {
              // Quiet — user hasn't opted into Capacities at all.
            }
          }

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
