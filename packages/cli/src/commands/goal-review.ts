import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach, isGoalStalled } from "@lifecoach/core";

const DAY = 24 * 60 * 60 * 1000;

interface ReviewLine {
  goalId: string;
  goalTitle: string;
  evidenceCount: number;
  completedMilestones: number;
  completedLinkedTasks: number;
  wasStalled: boolean;
  outcome: "progressing" | "stalled" | "quiet";
}

/**
 * Weekly goal-review pass. Designed to be cron-driven (Sundays 18:00 local —
 * see ecosystem.config.cjs) so its output is in place by the time the
 * 19:00 weekly reflection runs. The reflector reads the cron-origin
 * evidence we write here in its gatherPeriodData call.
 *
 * No LLM call. Pure SQL aggregation:
 *   - Count goal_evidence rows in the period per goal.
 *   - Count completed milestones in the period per goal.
 *   - Count linked tasks completed in the period per goal.
 *   - Decide an outcome per goal:
 *       progressing: any signal above is > 0.
 *       stalled:     none of the above AND isGoalStalled(...) → true.
 *       quiet:       none of the above but not yet stalled (within cadence).
 *   - Persist a cron-origin evidence row for progressing + stalled goals.
 *   - Stamp last_reviewed_at on every active goal so the next pass starts
 *     from a known timestamp.
 */
export const registerGoalReview = (program: Command): void => {
  program
    .command("goal-review")
    .description(
      "Sweep active goals: count this period's evidence + milestones + linked task completions, mark stalled goals, stamp last_reviewed_at.",
    )
    .option(
      "--days <n>",
      "Period length in days. Default 7 (matches the weekly cron cadence).",
      "7",
    )
    .action(async (opts: { days: string }) => {
      const periodDays = Math.max(1, Number(opts.days));
      const lc = createLifecoach();
      const spinner = ora({ text: "reviewing goals…", color: "cyan" }).start();
      try {
        const now = Date.now();
        const from = now - periodDays * DAY;

        const activeGoals = lc.storage.goals.list({ status: "active", limit: 500 });
        if (activeGoals.length === 0) {
          spinner.succeed("No active goals to review.");
          return;
        }

        // Bulk-fetch last evidence per goal once.
        const lastEvidence = lc.storage.goalEvidence.latestByGoals(
          activeGoals.map((g) => g.id),
        );

        // Per-goal counters from a single SQL pass each — cheaper than N queries.
        const db = lc.storage.handle.db;
        const evidenceCountRows = db
          .prepare(
            `SELECT goal_id AS goalId, COUNT(*) AS cnt
             FROM goal_evidence
             WHERE recorded_at >= ? AND recorded_at < ?
             GROUP BY goal_id`,
          )
          .all(from, now) as Array<{ goalId: string; cnt: number }>;
        const milestoneCountRows = db
          .prepare(
            `SELECT goal_id AS goalId, COUNT(*) AS cnt
             FROM milestones
             WHERE status = 'done'
               AND completed_at IS NOT NULL
               AND completed_at >= ? AND completed_at < ?
             GROUP BY goal_id`,
          )
          .all(from, now) as Array<{ goalId: string; cnt: number }>;
        const taskCountRows = db
          .prepare(
            `SELECT goal_id AS goalId, COUNT(*) AS cnt
             FROM tasks
             WHERE goal_id IS NOT NULL
               AND completed_at IS NOT NULL
               AND completed_at >= ? AND completed_at < ?
             GROUP BY goal_id`,
          )
          .all(from, now) as Array<{ goalId: string; cnt: number }>;

        const toMap = (rows: Array<{ goalId: string; cnt: number }>) => {
          const m = new Map<string, number>();
          for (const r of rows) m.set(r.goalId, r.cnt);
          return m;
        };
        const evidenceCount = toMap(evidenceCountRows);
        const milestoneCount = toMap(milestoneCountRows);
        const taskCount = toMap(taskCountRows);

        const lines: ReviewLine[] = [];

        for (const goal of activeGoals) {
          const ev = evidenceCount.get(goal.id) ?? 0;
          const ms = milestoneCount.get(goal.id) ?? 0;
          const tk = taskCount.get(goal.id) ?? 0;
          const wasStalled = isGoalStalled(
            goal,
            lastEvidence.get(goal.id)?.recordedAt ?? null,
            now,
          );
          const progressing = ev + ms + tk > 0;
          const outcome: ReviewLine["outcome"] = progressing
            ? "progressing"
            : wasStalled
              ? "stalled"
              : "quiet";

          // Emit a cron-origin evidence row that the next reflector pass will
          // read. We deliberately don't emit anything for 'quiet' goals — quiet
          // and inside their cadence window is normal, not newsworthy.
          if (outcome === "progressing") {
            const detail: string[] = [];
            if (ms > 0) detail.push(`${ms} milestone${ms === 1 ? "" : "s"} done`);
            if (tk > 0) detail.push(`${tk} linked task${tk === 1 ? "" : "s"} done`);
            if (ev > 0) detail.push(`${ev} evidence note${ev === 1 ? "" : "s"}`);
            lc.storage.goalEvidence.create({
              goalId: goal.id,
              body: `Weekly review: progressing — ${detail.join(", ")}.`,
              sourceRefType: null,
              sourceRefId: null,
              recordedAt: now,
              origin: "cron",
              confidence: 0.8,
            });
          } else if (outcome === "stalled") {
            lc.storage.goalEvidence.create({
              goalId: goal.id,
              body: `Weekly review: stalled — no touch within ${goal.reviewCadence} cadence.`,
              sourceRefType: null,
              sourceRefId: null,
              recordedAt: now,
              origin: "cron",
              confidence: 0.9,
            });
          }

          lc.storage.goals.markReviewed(goal.id);
          lines.push({
            goalId: goal.id,
            goalTitle: goal.title,
            evidenceCount: ev,
            completedMilestones: ms,
            completedLinkedTasks: tk,
            wasStalled,
            outcome,
          });
        }

        // Summary line for PM2 logs / interactive runs.
        const progressing = lines.filter((l) => l.outcome === "progressing").length;
        const stalled = lines.filter((l) => l.outcome === "stalled").length;
        const quiet = lines.filter((l) => l.outcome === "quiet").length;
        spinner.succeed(
          `Reviewed ${lines.length} active goal${lines.length === 1 ? "" : "s"}: ${progressing} progressing, ${stalled} stalled, ${quiet} quiet.`,
        );

        // Per-line detail when running interactively. Suppress when stdout
        // isn't a TTY (cron logs stay tidy).
        if (process.stdout.isTTY) {
          for (const l of lines) {
            const tag =
              l.outcome === "progressing"
                ? chalk.green("●")
                : l.outcome === "stalled"
                  ? chalk.yellow("○")
                  : chalk.dim("·");
            console.log(
              `  ${tag} ${l.goalTitle} — ev:${l.evidenceCount} ms:${l.completedMilestones} tk:${l.completedLinkedTasks}`,
            );
          }
        }
      } finally {
        lc.close();
      }
    });
};
