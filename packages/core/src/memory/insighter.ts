import Anthropic from "@anthropic-ai/sdk";
import {
  FINANCE_EVIDENCE_REF_TYPES,
  type EvidenceRef,
  type Insight,
  type InsightPriority,
} from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { IdentityMemory } from "./identity.js";
import type { SemanticMemory } from "./semantic.js";
import { refreshAttentionSignals } from "./attention.js";
import { indexMoneyMomentFromInsight } from "./finance-narratives.js";
import { computeNetWorth } from "../financial/portfolio.js";
import { normalizeToMonthlyAmount } from "../financial/recurring.js";
import { parseStringArray } from "../util/json.js";
import { withRetry } from "../util/retry.js";
import { LifecoachError } from "../util/errors.js";
import { isGoalStalled } from "../util/goal-cadence.js";
import { renderContext, type InsightContext } from "./insight-render.js";
import {
  insightPayloadSchema,
  buildInsighterPrompt,
  INSIGHT_TOOL_INPUT_SCHEMA,
  type InsightPayload,
} from "./insight-prompt.js";

// ContextData lives in insight-render.ts as InsightContext (extracted
// Wave 5.3). Aliased here for backward-compat across this file's internals
// so the gather function reads naturally.
type ContextData = InsightContext;

// ─── Context gathering ──────────────────────────────────────────────────────

const RECURRING_CANDIDATE_MIN_MONTHLY = 50;

const ONE_DAY = 24 * 60 * 60 * 1000;

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
  const { totalAssets, totalLiabilities, netWorth } = computeNetWorth(accounts);

  const month = new Date(nowMs);
  const thisMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const budgets = storage.financial.listBudgets(thisMonth);

  // Last-30d category rollup (NOT raw transactions — those are noise here).
  const since30 = nowMs - 30 * ONE_DAY;
  const txns30 = storage.financial.queryTransactions({ from: since30 });
  const rollup = new Map<string, { total: number; count: number }>();
  for (const t of txns30) {
    if (t.amount >= 0) continue; // expenses only (negative)
    if (t.categoryGroupType?.toLowerCase() === "transfer") continue; // exclude transfers
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
      ...(h.costBasis !== undefined ? { costBasis: h.costBasis } : {}),
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
    .map(([merchant, v]) => ({
      merchant,
      monthlyEstimate: normalizeToMonthlyAmount(v.totalAbs, v.count, v.freq, 3),
      sampleCount: v.count,
    }))
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
    netWorthSummary: { totalAssets, totalLiabilities, netWorth },
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
    const rendered = renderContext(data, Date.now());
    const prompt = buildInsighterPrompt(identity.render(), rendered);

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          tools: [
            {
              name: "record_insights",
              description: "Record 0–3 insights about the user.",
              input_schema: INSIGHT_TOOL_INPUT_SCHEMA,
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

/**
 * Active-subject cooldown: if an active insight (not acted/dismissed/snoozed)
 * for the same normalized subject was created within this window, suppress
 * the new one. Without this, the model re-surfaces the same subject under a
 * fresh headline every pass and the inbox fills with near-duplicates.
 */
const SUBJECT_ACTIVE_COOLDOWN_MS = 72 * 60 * 60 * 1000;

const persist = (storage: Storage, payload: InsightPayload): Insight[] => {
  const created: Insight[] = [];
  const nowMs = Date.now();
  const sinceMs = nowMs - 30 * ONE_DAY;
  const subjectCooldownSince = nowMs - SUBJECT_ACTIVE_COOLDOWN_MS;
  for (const item of payload.insights) {
    const evidenceRefs = item.evidenceRefs ?? [];
    if (isDuplicateInsight(storage, item.topic, evidenceRefs, sinceMs)) continue;
    if (storage.insights.activeBySubjectSince(item.topic, subjectCooldownSince).length > 0) {
      continue;
    }
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
