import type { EvidenceRef, InsightPriority } from "@lifecoach/schemas";
import { createHash } from "node:crypto";
import type { Storage, AttentionSignal } from "../storage/index.js";

const ONE_DAY = 24 * 60 * 60 * 1000;
const STALE_GOAL_MS = 14 * ONE_DAY;
const OLD_INSIGHT_MS = 7 * ONE_DAY;
const MEASUREMENT_WINDOW_MS = 90 * ONE_DAY;

const shortHash = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);

const clampPriority = (n: number): InsightPriority => (n >= 3 ? 3 : n >= 2 ? 2 : 1);

const dateLabel = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const ref = (
  refType: EvidenceRef["refType"],
  refId: string,
  quote?: string,
  score?: number,
): EvidenceRef => ({
  refType,
  refId,
  ...(quote ? { quote } : {}),
  ...(score !== undefined ? { score } : {}),
});

export const refreshAttentionSignals = (storage: Storage): AttentionSignal[] => {
  const signals = [
    ...overdueTaskSignals(storage),
    ...staleGoalSignals(storage),
    ...reflectionThreadSignals(storage),
    ...ignoredInsightSignals(storage),
    ...measurementShiftSignals(storage),
  ];

  for (const signal of signals) {
    storage.signals.upsert(signal);
  }
  return storage.signals.listActive(20);
};

type CandidateSignal = Parameters<Storage["signals"]["upsert"]>[0];

const overdueTaskSignals = (storage: Storage): CandidateSignal[] => {
  const nowMs = Date.now();
  return storage.tasks.list({ status: "overdue", limit: 20 }).map((task) => {
    const overdueDays = task.dueAt ? Math.max(1, Math.floor((nowMs - task.dueAt) / ONE_DAY)) : 1;
    const taskPriority = task.priority ?? 1;
    const priority = clampPriority(overdueDays >= 3 || taskPriority >= 4 ? 3 : 2);
    return {
      kind: "overdue_task",
      title: `Overdue task: ${task.content}`,
      body: task.dueAt
        ? `This task has been due since ${dateLabel(task.dueAt)}.`
        : "This task is overdue.",
      priority,
      evidenceRefs: [ref("task", task.id, task.content, priority)],
      dedupKey: `task-overdue:${task.id}`,
    };
  });
};

const staleGoalSignals = (storage: Storage): CandidateSignal[] => {
  const nowMs = Date.now();
  return storage.goals
    .list({ status: "active", limit: 100 })
    .filter((goal) => {
      const stale = nowMs - goal.updatedAt >= STALE_GOAL_MS;
      const overdue = typeof goal.dueAt === "number" && goal.dueAt < nowMs;
      return stale || overdue;
    })
    .slice(0, 20)
    .map((goal) => {
      const overdue = typeof goal.dueAt === "number" && goal.dueAt < nowMs;
      return {
        kind: "stale_goal",
        title: `Goal needs a pulse check: ${goal.title}`,
        body: overdue && typeof goal.dueAt === "number"
          ? `This goal passed its target date on ${dateLabel(goal.dueAt)}.`
          : `This goal has not been updated since ${dateLabel(goal.updatedAt)}.`,
        priority: overdue ? 3 : 2,
        evidenceRefs: [ref("goal", goal.id, goal.title, overdue ? 3 : 2)],
        dedupKey: `goal-stale:${goal.id}`,
      };
    });
};

const reflectionThreadSignals = (storage: Storage): CandidateSignal[] => {
  const rows = storage.reflections.list({ limit: 8 });

  const signals: CandidateSignal[] = [];
  const latest = rows[0];
  if (latest) {
    for (const thread of latest.openThreads.slice(0, 6)) {
      signals.push({
        kind: "open_reflection_thread",
        title: "Open thread from reflection",
        body: thread,
        priority: 2,
        evidenceRefs: [ref("reflection", latest.id, thread, 2)],
        dedupKey: `reflection-open:${latest.id}:${shortHash(thread)}`,
      });
    }
  }

  const concerns = new Map<string, { text: string; refs: EvidenceRef[] }>();
  for (const row of rows) {
    for (const concern of row.concerns) {
      const key = concern.toLowerCase().replace(/\s+/g, " ").trim();
      const existing = concerns.get(key) ?? { text: concern, refs: [] };
      existing.refs.push(ref("reflection", row.id, concern, 2));
      concerns.set(key, existing);
    }
  }
  for (const [key, value] of concerns) {
    if (value.refs.length < 2) continue;
    signals.push({
      kind: "repeated_concern",
      title: "Repeated reflection concern",
      body: value.text,
      priority: 2,
      evidenceRefs: value.refs.slice(0, 4),
      dedupKey: `reflection-concern:${shortHash(key)}`,
    });
  }

  return signals;
};

const ignoredInsightSignals = (storage: Storage): CandidateSignal[] => {
  const cutoff = Date.now() - OLD_INSIGHT_MS;
  return storage.insights
    .list({ state: "active", limit: 50 })
    .filter((insight) => insight.createdAt <= cutoff)
    .slice(0, 10)
    .map((insight) => ({
      kind: "ignored_insight",
      title: `Insight still open: ${insight.topic}`,
      body: insight.rationale ?? insight.body.slice(0, 240),
      priority: clampPriority(insight.priority),
      evidenceRefs: [ref("insight", insight.id, insight.topic, insight.priority)],
      dedupKey: `insight-open:${insight.id}`,
    }));
};

const measurementShiftSignals = (storage: Storage): CandidateSignal[] => {
  const since = Date.now() - MEASUREMENT_WINDOW_MS;
  const metrics = storage.measurements.distinctMetrics(since);

  const signals: CandidateSignal[] = [];
  for (const metric of metrics) {
    const summary = storage.measurements.summarize(metric, { from: since });
    if (
      summary.count < 3 ||
      summary.unitMismatch ||
      !summary.latest ||
      !summary.previous ||
      summary.delta === null ||
      summary.deltaPercent === null ||
      Math.abs(summary.deltaPercent) < 10
    ) {
      continue;
    }

    const direction = summary.delta > 0 ? "up" : "down";
    const priority = clampPriority(Math.abs(summary.deltaPercent) >= 20 ? 3 : 2);
    const unit = summary.unit ? ` ${summary.unit}` : "";
    signals.push({
      kind: "measurement_shift",
      title: `${metric} moved ${direction}`,
      body:
        `${metric} changed from ${summary.previous.value}${unit} to ${summary.latest.value}${unit} ` +
        `(${summary.deltaPercent.toFixed(1)}%) across the latest two readings.`,
      priority,
      evidenceRefs: [
        ref("measurement", summary.previous.id, `${summary.previous.value}${unit}`, 1),
        ref("measurement", summary.latest.id, `${summary.latest.value}${unit}`, priority),
      ],
      dedupKey: `measurement-shift:${metric}:${summary.previous.id}:${summary.latest.id}`,
    });
  }
  return signals;
};
