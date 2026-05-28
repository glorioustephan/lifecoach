/**
 * Pure prompt-rendering for the Insighter. No Anthropic SDK, no storage, no
 * side effects — just a `ContextData` → `string` transform. Extracted from
 * `insighter.ts` (Wave 5.3) so the gather-and-render stages can be tested
 * without an API key.
 *
 * The renderer is responsible for the EXACT contract the prompt promises the
 * model: stable `[id=…]`, `[goal=…]`, `[account=…]` citation tags, the
 * relative-age annotation that prevents date hallucination, the
 * G5-itemization-contract warning before the financial section. Changes here
 * affect insight quality directly — bump the schema version (the `v2` prefix
 * in finance-narratives) if the contract drifts.
 */

import type { EvidenceRef } from "@lifecoach/schemas";

const ONE_DAY = 24 * 60 * 60 * 1000;

export const MAX_CHARS = 80_000;

export const formatTimestamp = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 16).replace("T", " ");

/**
 * Compact human-readable age vs. `nowMs`. Used to annotate dated rows so the
 * model never has to compute "how long ago" — it copies a phrase the renderer
 * already produced. Without this, the model invents plausible-looking dates
 * (e.g. a future "May 28" when today is May 27) and reinforces them next pass
 * via the prior-insights feedback loop.
 */
export const relativeAge = (ms: number, nowMs: number): string => {
  const diff = nowMs - ms;
  if (diff < 0) {
    const futureDays = Math.round(-diff / ONE_DAY);
    return futureDays <= 1 ? "in the future" : `${futureDays}d in the future`;
  }
  const days = Math.floor(diff / ONE_DAY);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
};

// ── Shape the renderer consumes ─────────────────────────────────────────────
// Exported because the Insighter gather function returns this exact shape and
// passes it back here. Kept in sync with the corresponding fields in
// insighter.ts ContextData (re-exported to avoid two parallel declarations).

export interface InsightContext {
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
  activeTasks: Array<{
    id: string;
    content: string;
    priority: number | null;
    dueAt: number | null;
    projectName: string | null;
    labels: string[];
  }>;
  recentlyCompletedTasks: Array<{ id: string; content: string; completedAt: number | null }>;
  recentMeasurements: Array<{
    id: string;
    metric: string;
    value: number;
    unit: string | null;
    recordedAt: number;
  }>;
  latestReflections: Array<{
    id: string;
    kind: string;
    body: string;
    periodEnd: number;
    openThreads: string[];
    concerns: string[];
  }>;
  recentInsights: Array<{ id: string; topic: string; body: string; createdAt: number; state: string }>;
  financial: {
    accounts: Array<{ id: string; displayName: string; type: string; balance: number }>;
    netWorthSummary: { totalAssets: number; totalLiabilities: number; netWorth: number };
    budgets: Array<{ id: string; category: string; month: string; limit: number; spent: number }>;
    categoryRollup30d: Array<{ category: string; total: number; count: number }>;
    holdings: Array<{
      id: string;
      symbol: string;
      quantity: number;
      marketValue: number;
      costBasis?: number;
    }>;
    recurringCandidates: Array<{ merchant: string; monthlyEstimate: number; sampleCount: number }>;
  };
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
    recentEvidence: Array<{
      id: string;
      goalId: string;
      body: string;
      recordedAt: number;
      origin: string;
    }>;
  };
}

export const renderContext = (data: InsightContext, nowMs: number): string => {
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const parts: string[] = [
    `## Temporal anchor`,
    `Today: ${todayIso} (epochMs=${nowMs}). Do NOT invent dates. If a fact's exact date is not in the data below, say "recent" or omit the date — never synthesize one. When you need to describe how long ago something happened, copy the parenthetical age shown next to each row.`,
    ``,
  ];

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
      parts.push(
        `### ${r.kind} [id=${r.id}] (ending ${formatTimestamp(r.periodEnd)}, ${relativeAge(r.periodEnd, nowMs)})`,
      );
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
      if (t.dueAt)
        meta.push(
          `due ${new Date(t.dueAt).toISOString().slice(0, 10)} (${relativeAge(t.dueAt, nowMs)})`,
        );
      if (t.projectName) meta.push(t.projectName);
      if (t.labels.length > 0) meta.push("#" + t.labels.join(" #"));
      parts.push(
        `- [id=${t.id}] ${t.content}${meta.length ? ` (${meta.join(" · ")})` : ""}`,
      );
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
          `- [goal=${e.goalId} evidence=${e.id}] (${e.origin}) ${new Date(e.recordedAt).toISOString().slice(0, 10)} (${relativeAge(e.recordedAt, nowMs)}): ${e.body}`,
        );
      }
    }
  }

  if (data.recentMeasurements.length > 0) {
    parts.push("\n## Measurements (last 90d, grouped by metric)");
    const byMetric = new Map<string, InsightContext["recentMeasurements"]>();
    for (const m of data.recentMeasurements) {
      if (!byMetric.has(m.metric)) byMetric.set(m.metric, []);
      byMetric.get(m.metric)!.push(m);
    }
    for (const [metric, rows] of byMetric) {
      const series = rows
        .map(
          (r) =>
            `${new Date(r.recordedAt).toISOString().slice(0, 10)}(${relativeAge(r.recordedAt, nowMs)})[id=${r.id}]=${r.value}${r.unit ?? ""}`,
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
      parts.push(
        "\n### Spending by category — last 30 days (NOTE: based on Monarch's categorization; may include miscategorized rows)",
      );
      parts.push(
        "IMPORTANT — G5 itemization contract: Do NOT cite any dollar figure from this section " +
          "as a headline number without first calling `financial_monthly_rollup` to get the " +
          "canonical rollup with contributing_tx_ids[] and guard results. If a user asks " +
          "'where does that number come from?', call `get_rollup_contributors` with the same " +
          "period/category to return the drill-down transactions. Never cite a rollup-only " +
          "summary without itemization being available.",
      );
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
      parts.push(
        `[${formatTimestamp(m.createdAt)} · ${relativeAge(m.createdAt, nowMs)}] ${m.role} [id=${m.id}]: ${content}`,
      );
    }
  }

  if (data.recentInsights.length > 0) {
    parts.push(
      "\n## Prior insights (so you don't repeat yourself — do NOT restate these under a new headline)",
    );
    for (const i of data.recentInsights) {
      parts.push(
        `- [${i.state}] [${relativeAge(i.createdAt, nowMs)}] [id=${i.id}] ${i.topic}: ${i.body.slice(0, 120)}…`,
      );
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
