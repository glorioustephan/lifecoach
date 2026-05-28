import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  evidenceRefSchema,
  type EvidenceRef,
  type Insight,
  type InsightPriority,
} from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { IdentityMemory } from "./identity.js";
import type { SemanticMemory } from "./semantic.js";
import { refreshAttentionSignals } from "./attention.js";
import { indexMoneyMomentFromInsight } from "./finance-narratives.js";
import { withRetry } from "../util/retry.js";
import { LifecoachError } from "../util/errors.js";
import { isGoalStalled } from "../util/goal-cadence.js";

const FINANCE_EVIDENCE_REF_TYPES = new Set(["account", "transaction", "budget", "holding"]);

const insightPayloadSchema = z.object({
  insights: z
    .array(
      z.object({
        topic: z.string().min(1),
        body: z.string().min(1),
        rationale: z.string().optional(),
        priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
        sourceFactIds: z.array(z.string()).default([]),
        evidenceRefs: z.array(evidenceRefSchema).default([]),
      }),
    )
    .max(5),
});
type InsightPayload = z.infer<typeof insightPayloadSchema>;

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    insights: {
      type: "array",
      maxItems: 5,
      description:
        "0–3 high-quality insights. Be SELECTIVE. Skip if nothing notable jumps out. The user is one person — quality over quantity.",
      items: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "Short title (3–7 words). E.g. 'Sleep onset drifting later'.",
          },
          body: {
            type: "string",
            description:
              "1–2 paragraphs. Address the user as 'you'. Be specific (cite numbers, dates, named patterns from the data). Avoid generic advice.",
          },
          rationale: {
            type: "string",
            description:
              "1 sentence. Why this matters NOW vs. always. Reference the trigger (a recent shift, a missed routine, a measurement change).",
          },
          priority: {
            type: "integer",
            enum: [1, 2, 3],
            description: "1 = nice to notice, 2 = worth noticing, 3 = needs attention soon",
          },
          sourceFactIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Backwards-compatible fact IDs that anchor this insight. Prefer evidenceRefs when possible.",
          },
          evidenceRefs: {
            type: "array",
            description:
              "Specific evidence behind the insight. Use visible ref IDs from attention signals and data.",
            items: {
              type: "object",
              properties: {
                refType: {
                  type: "string",
                  enum: [
                    "fact",
                    "goal",
                    "task",
                    "measurement",
                    "document",
                    "message",
                    "reflection",
                    "insight",
                    "account",
                    "transaction",
                    "budget",
                    "holding",
                  ],
                },
                refId: { type: "string" },
                quote: {
                  type: "string",
                  description: "Short quote, measurement value, or task title that supports the insight.",
                },
                score: { type: "number" },
              },
              required: ["refType", "refId"],
            },
          },
        },
        required: ["topic", "body", "priority"],
      },
    },
  },
  required: ["insights"],
};

// ─── Context gathering ──────────────────────────────────────────────────────

interface ContextData {
  facts: Array<{ id: string; category: string; subject: string; body: string }>;
  attentionSignals: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
    priority: number;
    evidenceRefs: EvidenceRef[];
  }>;
  recentMessages: Array<{ id: string; role: string; content: string; createdAt: number }>;
  activeTasks: Array<{ id: string; content: string; priority: number | null; dueAt: number | null; projectName: string | null; labels: string[] }>;
  recentlyCompletedTasks: Array<{ id: string; content: string; completedAt: number | null }>;
  recentMeasurements: Array<{ id: string; metric: string; value: number; unit: string | null; recordedAt: number }>;
  latestReflections: Array<{ id: string; kind: string; body: string; periodEnd: number; openThreads: string[]; concerns: string[] }>;
  recentInsights: Array<{ id: string; topic: string; body: string; createdAt: number; state: string }>;
  /**
   * Bounded financial context — only summaries/rollups, never raw transaction
   * rows. The Insighter is the single home for financial insights now; the
   * previous standalone FinancialAnalyzer has been retired so cross-domain
   * insights (e.g. "spending spiked the week sleep collapsed") become possible.
   */
  financial: {
    accounts: Array<{ id: string; displayName: string; type: string; balance: number }>;
    netWorthSummary: { totalAssets: number; totalLiabilities: number; netWorth: number };
    budgets: Array<{ id: string; category: string; month: string; limit: number; spent: number }>;
    categoryRollup30d: Array<{ category: string; total: number; count: number }>;
    holdings: Array<{ id: string; symbol: string; quantity: number; marketValue: number; costBasis?: number }>;
    /** Recurring expense candidates ≥$50/mo, grounding for the expense-research insight pattern. */
    recurringCandidates: Array<{ merchant: string; monthlyEstimate: number; sampleCount: number }>;
  };
  /** Compact goal-state block. Drives the three goal-specific insight shapes
   *  (stalled / no-next-action / obstacle-untouched). Sized for the prompt. */
  goalState: {
    goals: Array<{
      id: string;
      title: string;
      kind: string;
      cadence: string | null;
      reviewCadence: string;
      obstacle: string | null;
      implementationIntention: string | null;
      lastReviewedAt: number | null;
      dueAt: number | null;
      stalled: boolean;
      milestonesDone: number;
      milestonesTotal: number;
      linkedActiveTaskCount: number;
      lastEvidenceAt: number | null;
    }>;
    /** Evidence rows from the last 14d, newest first. The model uses these
     *  to spot patterns the user mentioned in chat. */
    recentEvidence: Array<{
      id: string;
      goalId: string;
      body: string;
      recordedAt: number;
      origin: string;
    }>;
  };
}

const FINANCIAL_LIABILITY_TYPES = new Set<string>(["debt", "credit_card"]);
const RECURRING_CANDIDATE_MIN_MONTHLY = 50;
const RECURRING_FREQUENCY_TO_MONTHLY: Record<string, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  bimonthly: 0.5,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
  yearly: 1 / 12,
};

const ONE_DAY = 24 * 60 * 60 * 1000;

const parseStringArray = (raw: string): string[] => {
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
};

const gather = (storage: Storage): ContextData => {
  const db = storage.handle.db;
  const nowMs = Date.now();
  const attentionSignals = refreshAttentionSignals(storage).map((signal) => ({
    id: signal.id,
    kind: signal.kind,
    title: signal.title,
    body: signal.body,
    priority: signal.priority,
    evidenceRefs: signal.evidenceRefs,
  }));

  const facts = db
    .prepare(
      `SELECT id, category, subject, body
       FROM facts WHERE valid_to IS NULL
       ORDER BY created_at DESC LIMIT 50`,
    )
    .all() as ContextData["facts"];

  const recentMessages = db
    .prepare(
      `SELECT id, role, content, created_at AS createdAt
       FROM messages WHERE created_at >= ?
       ORDER BY created_at DESC LIMIT 60`,
    )
    .all(nowMs - 7 * ONE_DAY) as ContextData["recentMessages"];

  const activeTasks = storage.tasks
    .list({ status: "active", limit: 100 })
    .map((t) => ({
      id: t.id,
      content: t.content,
      priority: t.priority ?? null,
      dueAt: t.dueAt ?? null,
      projectName: t.projectName ?? null,
      labels: t.labels,
    }));

  const recentlyCompletedTasks = db
    .prepare(
      `SELECT id, content, completed_at AS completedAt
       FROM tasks WHERE completed_at IS NOT NULL AND completed_at >= ?
       ORDER BY completed_at DESC LIMIT 40`,
    )
    .all(nowMs - 14 * ONE_DAY) as ContextData["recentlyCompletedTasks"];

  const recentMeasurements = db
    .prepare(
      `SELECT id, metric, value, unit, recorded_at AS recordedAt
       FROM measurements WHERE recorded_at >= ?
       ORDER BY metric, recorded_at ASC LIMIT 200`,
    )
    .all(nowMs - 90 * ONE_DAY) as ContextData["recentMeasurements"];

  const latestReflections = db
    .prepare(
      `SELECT id, kind, body, open_threads AS openThreads, concerns,
              period_end AS periodEnd
       FROM reflections
       ORDER BY period_end DESC LIMIT 4`,
    )
    .all()
    .map((row) => {
      const r = row as {
        id: string;
        kind: string;
        body: string;
        openThreads: string;
        concerns: string;
        periodEnd: number;
      };
      return {
        id: r.id,
        kind: r.kind,
        body: r.body,
        openThreads: parseStringArray(r.openThreads),
        concerns: parseStringArray(r.concerns),
        periodEnd: r.periodEnd,
      };
    }) as ContextData["latestReflections"];

  const recentInsights = db
    .prepare(
      `SELECT id, topic, body, created_at AS createdAt,
              CASE
                WHEN acted_on_at IS NOT NULL THEN 'acted'
                WHEN dismissed_at IS NOT NULL THEN 'dismissed'
                WHEN snoozed_until IS NOT NULL AND snoozed_until > ${nowMs} THEN 'snoozed'
                ELSE 'active'
              END AS state
       FROM insights WHERE created_at >= ?
       ORDER BY created_at DESC LIMIT 20`,
    )
    .all(nowMs - 30 * ONE_DAY) as ContextData["recentInsights"];

  const financial = gatherFinancial(storage, nowMs);

  // ── Goal state for the three goal-specific framings ─────────────────────
  const allActiveGoals = storage.goals.list({ status: "active", limit: 200 });
  const evidenceByGoal = storage.goalEvidence.latestByGoals(
    allActiveGoals.map((g) => g.id),
  );
  // Count linked active tasks per goal in one query rather than N.
  const linkedTaskCounts = new Map<string, number>();
  const linkedRows = db
    .prepare(
      `SELECT goal_id AS goalId, COUNT(*) AS cnt
       FROM tasks
       WHERE goal_id IS NOT NULL AND completed_at IS NULL
       GROUP BY goal_id`,
    )
    .all() as Array<{ goalId: string; cnt: number }>;
  for (const r of linkedRows) linkedTaskCounts.set(r.goalId, r.cnt);
  // Milestone progress per goal, also in one query.
  const milestoneCounts = new Map<string, { done: number; total: number }>();
  const milestoneRows = db
    .prepare(
      `SELECT goal_id AS goalId,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
       FROM milestones GROUP BY goal_id`,
    )
    .all() as Array<{ goalId: string; total: number; done: number | null }>;
  for (const r of milestoneRows) {
    milestoneCounts.set(r.goalId, { done: r.done ?? 0, total: r.total });
  }

  const goalStateGoals = allActiveGoals.map((g) => {
    const lastEv = evidenceByGoal.get(g.id);
    const ms = milestoneCounts.get(g.id) ?? { done: 0, total: 0 };
    return {
      id: g.id,
      title: g.title,
      kind: g.kind as string,
      cadence: g.cadence ?? null,
      reviewCadence: g.reviewCadence as string,
      obstacle: g.obstacle ?? null,
      implementationIntention: g.implementationIntention ?? null,
      lastReviewedAt: g.lastReviewedAt ?? null,
      dueAt: g.dueAt ?? null,
      stalled: isGoalStalled(g, lastEv?.recordedAt ?? null, nowMs),
      milestonesDone: ms.done,
      milestonesTotal: ms.total,
      linkedActiveTaskCount: linkedTaskCounts.get(g.id) ?? 0,
      lastEvidenceAt: lastEv?.recordedAt ?? null,
    };
  });
  const recentEvidence = storage.goalEvidence
    .list({
      recordedAfter: nowMs - 14 * ONE_DAY,
      limit: 60,
    })
    .map((e) => ({
      id: e.id,
      goalId: e.goalId,
      body: e.body,
      recordedAt: e.recordedAt,
      origin: e.origin,
    }));

  return {
    facts,
    attentionSignals,
    recentMessages,
    activeTasks,
    recentlyCompletedTasks,
    recentMeasurements,
    latestReflections,
    recentInsights,
    financial,
    goalState: { goals: goalStateGoals, recentEvidence },
  };
};

/**
 * Bounded financial context for the unified Insighter. We deliberately
 * aggregate into rollups + summaries rather than dumping raw transactions —
 * an insight pass should reason over trends, not every coffee. All emitted
 * rows carry IDs so the model can cite them via evidenceRefs.
 */
const gatherFinancial = (
  storage: Storage,
  nowMs: number,
): ContextData["financial"] => {
  const accounts = storage.financial.listAccounts({ status: "active" });
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const a of accounts) {
    if (FINANCIAL_LIABILITY_TYPES.has(a.type)) totalLiabilities += Math.abs(a.balance);
    else totalAssets += a.balance;
  }

  const month = new Date(nowMs);
  const thisMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const budgets = storage.financial.listBudgets(thisMonth);

  // Last-30d category rollup (NOT raw transactions — those are noise here).
  const since30 = nowMs - 30 * ONE_DAY;
  const txns30 = storage.financial.queryTransactions({ from: since30 });
  const rollup = new Map<string, { total: number; count: number }>();
  for (const t of txns30) {
    if (t.amount >= 0) continue; // expenses only (negative)
    const cat = t.category ?? "uncategorized";
    const entry = rollup.get(cat) ?? { total: 0, count: 0 };
    entry.total += Math.abs(t.amount);
    entry.count += 1;
    rollup.set(cat, entry);
  }
  const categoryRollup30d = Array.from(rollup.entries())
    .map(([category, v]) => ({ category, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  // Latest holdings snapshot only.
  const allHoldings = storage.financial.queryHoldings();
  const latestSnap = allHoldings.reduce((m, h) => Math.max(m, h.snapshotDate), 0);
  const holdings = allHoldings
    .filter((h) => h.snapshotDate === latestSnap)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, 10)
    .map((h) => ({
      id: h.id,
      symbol: h.symbol,
      quantity: h.quantity,
      marketValue: h.marketValue,
      costBasis: h.costBasis,
    }));

  // Recurring expense candidates ≥$50/mo (for the expense-research pattern in 1E).
  // Group recurring txns over last 90d by merchant; normalize to monthly cost.
  const since90 = nowMs - 90 * ONE_DAY;
  const recurringTxns = storage.financial
    .queryTransactions({ from: since90 })
    .filter((t) => t.isRecurring && t.amount < 0);
  const byMerchant = new Map<string, { totalAbs: number; count: number; freq?: string }>();
  for (const t of recurringTxns) {
    const key = (t.merchant ?? "Unknown").trim();
    const entry = byMerchant.get(key) ?? { totalAbs: 0, count: 0 };
    entry.totalAbs += Math.abs(t.amount);
    entry.count += 1;
    if (!entry.freq && t.recurringFrequency) entry.freq = t.recurringFrequency.toLowerCase();
    byMerchant.set(key, entry);
  }
  const recurringCandidates = Array.from(byMerchant.entries())
    .map(([merchant, v]) => {
      const freqMul = v.freq ? RECURRING_FREQUENCY_TO_MONTHLY[v.freq] : undefined;
      // If frequency known, normalize a single charge × freq; else use 90d avg.
      const monthlyEstimate = freqMul
        ? (v.totalAbs / v.count) * freqMul
        : v.totalAbs / 3; // 90 days ≈ 3 months
      return { merchant, monthlyEstimate, sampleCount: v.count };
    })
    .filter((c) => c.monthlyEstimate >= RECURRING_CANDIDATE_MIN_MONTHLY)
    .sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
    .slice(0, 10);

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      type: a.type,
      balance: a.balance,
    })),
    netWorthSummary: {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    },
    budgets: budgets.map((b) => ({
      id: b.id,
      category: b.category,
      month: b.month,
      limit: b.limit,
      spent: b.spent,
    })),
    categoryRollup30d,
    holdings,
    recurringCandidates,
  };
};

const MAX_CHARS = 80_000;

const formatTimestamp = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 16).replace("T", " ");

const renderContext = (data: ContextData): string => {
  const parts: string[] = [];

  if (data.attentionSignals.length > 0) {
    parts.push("## SQLite attention signals (ranked candidates)");
    for (const s of data.attentionSignals) {
      const evidence = s.evidenceRefs
        .map((e) => `${e.refType}:${e.refId}${e.quote ? ` "${e.quote.slice(0, 120)}"` : ""}`)
        .join("; ");
      parts.push(
        `- [signal=${s.id}] [${s.kind}] p${s.priority} ${s.title}: ${s.body}` +
          (evidence ? `\n  evidence: ${evidence}` : ""),
      );
    }
  }

  if (data.latestReflections.length > 0) {
    parts.push("## Recent reflections (newest first)");
    for (const r of data.latestReflections) {
      parts.push(`### ${r.kind} [id=${r.id}] (ending ${formatTimestamp(r.periodEnd)})`);
      if (r.openThreads.length > 0) {
        parts.push(`open threads: ${r.openThreads.join("; ")}`);
      }
      if (r.concerns.length > 0) {
        parts.push(`concerns: ${r.concerns.join("; ")}`);
      }
      parts.push(r.body);
    }
  }

  if (data.facts.length > 0) {
    parts.push("\n## Active facts (with IDs you can cite)");
    for (const f of data.facts) {
      parts.push(`- [id=${f.id}] [${f.category}/${f.subject}] ${f.body}`);
    }
  }

  if (data.activeTasks.length > 0) {
    parts.push("\n## Active tasks");
    for (const t of data.activeTasks) {
      const meta: string[] = [];
      if (t.priority) meta.push(`p${5 - t.priority}`);
      if (t.dueAt) meta.push(`due ${new Date(t.dueAt).toISOString().slice(0, 10)}`);
      if (t.projectName) meta.push(t.projectName);
      if (t.labels.length > 0) meta.push("#" + t.labels.join(" #"));
      parts.push(`- [id=${t.id}] ${t.content}${meta.length ? ` (${meta.join(" · ")})` : ""}`);
    }
  }

  if (data.recentlyCompletedTasks.length > 0) {
    parts.push("\n## Recently completed tasks (last 14d)");
    for (const t of data.recentlyCompletedTasks) {
      parts.push(`- [id=${t.id}] ${t.content}`);
    }
  }

  if (data.goalState.goals.length > 0) {
    parts.push("\n## Goal state (cite via evidenceRefs refType=goal)");
    parts.push(
      "Columns: id, title, kind/cadence, review cadence, last touch (days), stalled?, milestones done/total, linked active tasks. " +
        "A goal with 0 linked active tasks + 0 recent evidence is a strong candidate for the 'no next action' framing.",
    );
    for (const g of data.goalState.goals) {
      const lastTouchMs = g.lastEvidenceAt ?? g.lastReviewedAt;
      const lastTouchDays =
        lastTouchMs !== null
          ? Math.floor((Date.now() - lastTouchMs) / ONE_DAY) + "d"
          : "never";
      const cadenceTag =
        g.kind === "process" && g.cadence ? `${g.kind}/${g.cadence}` : g.kind;
      parts.push(
        `- [goal=${g.id}] ${g.title} (${cadenceTag}, review=${g.reviewCadence}, last touch ${lastTouchDays}, stalled=${g.stalled}, milestones ${g.milestonesDone}/${g.milestonesTotal}, ${g.linkedActiveTaskCount} active task${g.linkedActiveTaskCount === 1 ? "" : "s"})`,
      );
      if (g.obstacle) parts.push(`    obstacle: ${g.obstacle}`);
      if (g.implementationIntention) parts.push(`    plan: ${g.implementationIntention}`);
    }
    if (data.goalState.recentEvidence.length > 0) {
      parts.push("\nRecent goal evidence (last 14d, newest first):");
      for (const e of data.goalState.recentEvidence) {
        parts.push(
          `- [goal=${e.goalId} evidence=${e.id}] (${e.origin}) ${new Date(e.recordedAt).toISOString().slice(0, 10)}: ${e.body}`,
        );
      }
    }
  }

  if (data.recentMeasurements.length > 0) {
    parts.push("\n## Measurements (last 90d, grouped by metric)");
    const byMetric = new Map<string, ContextData["recentMeasurements"]>();
    for (const m of data.recentMeasurements) {
      if (!byMetric.has(m.metric)) byMetric.set(m.metric, []);
      byMetric.get(m.metric)!.push(m);
    }
    for (const [metric, rows] of byMetric) {
      const series = rows
        .map(
          (r) =>
            `${new Date(r.recordedAt).toISOString().slice(0, 10)}[id=${r.id}]=${r.value}${r.unit ?? ""}`,
        )
        .join(", ");
      parts.push(`- ${metric}: ${series}`);
    }
  }

  // Financial section — rolled-up summaries only; never raw transactions.
  const fin = data.financial;
  const hasFinance =
    fin.accounts.length > 0 ||
    fin.budgets.length > 0 ||
    fin.categoryRollup30d.length > 0 ||
    fin.holdings.length > 0 ||
    fin.recurringCandidates.length > 0;
  if (hasFinance) {
    parts.push("\n## Financial state (rollups — cite via evidenceRefs)");
    if (fin.accounts.length > 0) {
      parts.push(
        `### Accounts (net worth: $${fin.netWorthSummary.netWorth.toFixed(0)} = assets $${fin.netWorthSummary.totalAssets.toFixed(0)} − liabilities $${fin.netWorthSummary.totalLiabilities.toFixed(0)})`,
      );
      for (const a of fin.accounts) {
        parts.push(
          `- [account=${a.id}] ${a.displayName} (${a.type}): $${a.balance.toFixed(2)}`,
        );
      }
    }
    if (fin.budgets.length > 0) {
      parts.push("\n### Budgets (this month)");
      for (const b of fin.budgets) {
        const pct = b.limit > 0 ? Math.round((b.spent / b.limit) * 100) : 0;
        const status = pct > 100 ? "OVER" : pct > 80 ? "near" : "on";
        parts.push(
          `- [budget=${b.id}] ${b.category}: $${b.spent.toFixed(2)} / $${b.limit.toFixed(2)} (${pct}%, ${status})`,
        );
      }
    }
    if (fin.categoryRollup30d.length > 0) {
      parts.push("\n### Spending by category — last 30 days (NOTE: based on Monarch's categorization; may include miscategorized rows)");
      for (const r of fin.categoryRollup30d) {
        parts.push(`- ${r.category}: $${r.total.toFixed(2)} (${r.count} txns)`);
      }
    }
    if (fin.holdings.length > 0) {
      parts.push("\n### Investment holdings (latest snapshot)");
      for (const h of fin.holdings) {
        const gl =
          h.costBasis !== undefined ? h.marketValue - h.costBasis : undefined;
        const glPct =
          h.costBasis && h.costBasis !== 0 ? ((gl ?? 0) / h.costBasis) * 100 : undefined;
        parts.push(
          `- [holding=${h.id}] ${h.symbol}: ${h.quantity} units = $${h.marketValue.toFixed(2)}` +
            (gl !== undefined
              ? ` (g/l: $${gl.toFixed(2)}${glPct !== undefined ? `, ${glPct.toFixed(1)}%` : ""})`
              : ""),
        );
      }
    }
    if (fin.recurringCandidates.length > 0) {
      parts.push("\n### Recurring expenses ≥$50/mo (candidates for review)");
      for (const c of fin.recurringCandidates) {
        parts.push(
          `- ${c.merchant}: ~$${c.monthlyEstimate.toFixed(0)}/mo (${c.sampleCount} samples in last 90d)`,
        );
      }
    }
  }

  if (data.recentMessages.length > 0) {
    parts.push("\n## Recent messages (last 7d, newest first)");
    for (const m of data.recentMessages) {
      const content = m.content.length > 400 ? m.content.slice(0, 400) + "…" : m.content;
      parts.push(`[${formatTimestamp(m.createdAt)}] ${m.role} [id=${m.id}]: ${content}`);
    }
  }

  if (data.recentInsights.length > 0) {
    parts.push("\n## Prior insights (so you don't repeat yourself)");
    for (const i of data.recentInsights) {
      parts.push(`- [${i.state}] [id=${i.id}] ${i.topic}: ${i.body.slice(0, 120)}…`);
    }
  }

  let rendered = parts.join("\n");
  if (rendered.length > MAX_CHARS) {
    rendered =
      rendered.slice(0, MAX_CHARS) +
      `\n\n[truncated — original was ${rendered.length} chars]`;
  }
  return rendered;
};

const buildPrompt = (identityProfile: string, rendered: string): string =>
  `You are a personal life/health coach surfacing insights from the user's data.

## Who the user is
${identityProfile}

## Data
${rendered}

---

Call \`record_insights\` with **0–3 high-quality insights**. Quality bar:

1. **Specific.** Cite numbers, dates, named patterns. "Sleep onset drifted from 9:30 to 11:00 over 5 days" beats "your sleep is off."
2. **Trigger-relevant.** Don't restate static facts. Insight = a thing that's CHANGED or that the user hasn't noticed about themselves.
3. **Evidence-backed.** Prefer the SQLite attention signals, and include concrete \`evidenceRefs\` with refType/refId/quote so the user can see why this surfaced.
4. **Non-redundant.** Check the "Prior insights" section. No nagging: don't repeat an old insight unless the evidence changed materially.
5. **Honest but not alarmist.** Health-related observations should cite the measurements and avoid medical authority. A 12% HRV dip is worth flagging; a 2% one isn't.

**Goal-specific framings** (use sparingly — these aren't required every pass, but they're the right *shape* when the data points to them):

- **"Goal has gone quiet."** Use when the goal-state row shows \`stalled=true\` AND there's no plausible reason in recent messages — the goal hasn't been mentioned and no linked task moved. Topic format: \`Quiet: <goal title>\`. Be specific about the last-touch age. Cite the goal via \`refType=goal\`.
- **"No next action on <goal title>."** Use when a goal has \`linkedActiveTaskCount=0\` AND \`milestonesTotal\` is also 0 or stale (no done in 14d). The user committed to something but never decomposed it. Topic format: \`No next action: <goal title>\`. Suggest decomposition in the body.
- **"Untouched obstacle on <goal title>."** Use when the goal has a non-null \`obstacle\` AND none of the recent goal evidence rows or messages mention handling it. This is the WOOP mental-contrasting cue going stale. Topic format: \`Obstacle untouched: <goal title>\`. Quote the obstacle text.

These are *framings*, not enum values — keep the existing topic-as-free-text contract. Skip them when nothing fits; never invent one to fill a slot.

**Financial observations.** Financial state appears as "Financial state (rollups)" above with citable IDs (\`account=…\`, \`budget=…\`, \`holding=…\`). Treat money like any other life signal — when a financial pattern coincides with a life pattern (sleep, stress, a goal, a recurring theme in messages), that coincidence IS the insight; that's the thing only this coach can see. No financial advice, just observations and simple math. Be especially honest about uncertainty: category rollups depend on Monarch's categorization which can be wrong. When you cite a category number, **invite the user to challenge it** (e.g. "If 'Dining $1,036' looks high, tell me which transactions don't belong and I'll recategorize them so the picture stays accurate"). For recurring-expense downgrade suggestions (from the "Recurring expenses ≥$50/mo" list), use the **exact topic format \`Recurring: <Merchant>\`** (so the system can suppress the same suggestion for ~9 months after a dismissal) and surface **at most one** such item per pass with a clear monthly dollar figure. Don't do the alternative research in this pass — the chat agent does it lazily when the user clicks Discuss.

If genuinely nothing notable jumps out, return an empty array. That's a valid answer.`;

// ─── Generator ──────────────────────────────────────────────────────────────

export interface InsighterOptions {
  apiKey: string;
  model?: string;
  maxRetries?: number;
  /**
   * Optional: when provided, finance-evidenced insights are also indexed as
   * "money moments" via Voyage so they're recallable later ("that time we
   * discussed the cell plan"). Non-critical — failures don't fail the pass.
   */
  semantic?: SemanticMemory;
}

export class Insighter {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly semantic: SemanticMemory | undefined;

  constructor(opts: InsighterOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxRetries = opts.maxRetries ?? 4;
    this.semantic = opts.semantic;
  }

  async generate(storage: Storage, identity: IdentityMemory): Promise<Insight[]> {
    const data = gather(storage);
    const rendered = renderContext(data);
    const prompt = buildPrompt(identity.render(), rendered);

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          tools: [
            {
              name: "record_insights",
              description: "Record 0–3 insights about the user.",
              input_schema: TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: "record_insights" },
          messages: [{ role: "user", content: prompt }],
        }),
      { maxAttempts: this.maxRetries },
    );

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LifecoachError("Insighter: model didn't call record_insights", "INSIGHT_NO_TOOL_USE");
    }
    const parsed = insightPayloadSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new LifecoachError(
        `Insighter: invalid payload: ${parsed.error.message}`,
        "INSIGHT_INVALID_PAYLOAD",
      );
    }
    const created = persist(storage, parsed.data);
    // Money-moment indexing — embed each finance-evidenced insight as prose
    // so the coach can semantically recall financial decisions later. Fire and
    // forget; embedding failures must not fail the insight pass.
    if (this.semantic) {
      const semantic = this.semantic;
      for (const ins of created) {
        if (ins.evidenceRefs.some((r) => FINANCE_EVIDENCE_REF_TYPES.has(r.refType))) {
          void indexMoneyMomentFromInsight(semantic, ins).catch(() => {
            /* non-critical */
          });
        }
      }
    }
    return created;
  }
}

/**
 * Recurring-expense downgrade suggestions ("Recurring: <merchant>" topics) get
 * a long suppression window: if the user already dismissed one, don't raise it
 * again for ~9 months. Without this, the model would re-surface "switch your
 * phone plan" every insight pass.
 */
const RECURRING_TOPIC_PREFIX = "Recurring:";
const RECURRING_DISMISSAL_SUPPRESSION_MS = 270 * ONE_DAY; // ~9 months

const persist = (storage: Storage, payload: InsightPayload): Insight[] => {
  const created: Insight[] = [];
  const nowMs = Date.now();
  const sinceMs = nowMs - 30 * ONE_DAY;
  for (const item of payload.insights) {
    const evidenceRefs = item.evidenceRefs ?? [];
    if (isDuplicateInsight(storage, item.topic, evidenceRefs, sinceMs)) continue;
    if (item.topic.startsWith(RECURRING_TOPIC_PREFIX)) {
      const cutoff = nowMs - RECURRING_DISMISSAL_SUPPRESSION_MS;
      if (storage.insights.dismissedByTopicSince(item.topic, cutoff)) continue;
    }
    const ins = storage.insights.create({
      topic: item.topic,
      body: item.body,
      ...(item.rationale ? { rationale: item.rationale } : {}),
      sourceFactIds: item.sourceFactIds ?? [],
      evidenceRefs,
      priority: item.priority as InsightPriority,
    });
    created.push(ins);
  }
  return created;
};

const evidenceKey = (ref: EvidenceRef): string => `${ref.refType}:${ref.refId}`;

const isDuplicateInsight = (
  storage: Storage,
  topic: string,
  evidenceRefs: EvidenceRef[],
  sinceMs: number,
): boolean => {
  const recent = storage.insights.recentByTopic(topic, sinceMs);
  if (recent.length === 0) return false;
  if (evidenceRefs.length === 0) return true;
  const incoming = new Set(evidenceRefs.map(evidenceKey));
  return recent.some((existing) => {
    if (existing.evidenceRefs.length === 0) return false;
    const existingKeys = new Set(existing.evidenceRefs.map(evidenceKey));
    for (const key of incoming) {
      if (!existingKeys.has(key)) return false;
    }
    return true;
  });
};
