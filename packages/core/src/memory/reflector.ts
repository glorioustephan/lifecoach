import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Reflection, ReflectionKind } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { IdentityMemory } from "./identity.js";
import { withRetry } from "../util/retry.js";
import { LifecoachError } from "../util/errors.js";

// ─── Structured payload the LLM emits via tool use ───────────────────────────

const reflectionPayloadSchema = z.object({
  /** 2-3 paragraph synthesis in the user's voice. */
  body: z.string().min(1),
  /** 2-4 short thematic tags. */
  themes: z.array(z.string()).default([]),
  /** Things the user said but hasn't resolved. */
  openThreads: z.array(z.string()).default([]),
  /** Anything that went well. */
  wins: z.array(z.string()).default([]),
  /** Anything that warrants attention. */
  concerns: z.array(z.string()).default([]),
  /** Optional short title shown in lists ("Week of May 12"). */
  title: z.string().optional(),
});
export type ReflectionPayload = z.infer<typeof reflectionPayloadSchema>;

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string",
      description:
        "Short title (4-8 words) suitable for a list ('Week of May 12', 'Tuesday check-in'). Optional.",
    },
    body: {
      type: "string",
      description:
        "2-3 paragraph synthesis. Speak ABOUT the user (third person or 'you'), not as the user. Highlight what shifted, not just what happened. Avoid bullet lists in the body — those go in the structured fields below.",
    },
    themes: {
      type: "array",
      items: { type: "string" },
      description:
        "2-4 short thematic tags (1-3 words each). Examples: 'morning routine', 'sleep hygiene', 'protein anchoring'.",
    },
    openThreads: {
      type: "array",
      items: { type: "string" },
      description:
        "Things the user raised but didn't resolve — questions, ideas, half-decisions. Each item should be 1-2 sentences max.",
    },
    wins: {
      type: "array",
      items: { type: "string" },
      description:
        "Things that went well, even small ones. 1 sentence each.",
    },
    concerns: {
      type: "array",
      items: { type: "string" },
      description:
        "Patterns or signals worth attention: missed routines, repeated friction, anomalous measurements. 1 sentence each. Be honest but not alarmist.",
    },
  },
  required: ["body"],
};

// ─── Data gathering ──────────────────────────────────────────────────────────

const KIND_LABEL: Record<ReflectionKind, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

interface PeriodData {
  messages: Array<{ role: string; content: string; createdAt: number }>;
  facts: Array<{ category: string; subject: string; body: string; createdAt: number }>;
  completedTasks: Array<{ content: string; completedAt: number | null }>;
  measurements: Array<{ metric: string; value: number; unit: string | null; recordedAt: number }>;
  priorReflections: Array<{ kind: string; body: string; periodEnd: number }>;
  financialAccounts?: Array<{ displayName: string; type: string; balance: number }>;
  financialInsights?: Array<{ topic: string; body: string; category: string; priority: number }>;
  financialTransactionSummary?: { totalSpent: number; topCategories: Array<{ category: string; amount: number }> };
}

const gatherPeriodData = (storage: Storage, from: number, to: number, includeFinancial = false): PeriodData => {
  const db = storage.handle.db;

  const messages = db
    .prepare(
      `SELECT role, content, created_at AS createdAt
       FROM messages
       WHERE created_at >= ? AND created_at < ?
       ORDER BY created_at ASC`,
    )
    .all(from, to) as PeriodData["messages"];

  const facts = db
    .prepare(
      `SELECT category, subject, body, created_at AS createdAt
       FROM facts
       WHERE created_at >= ? AND created_at < ? AND valid_to IS NULL
       ORDER BY created_at ASC`,
    )
    .all(from, to) as PeriodData["facts"];

  const completedTasks = db
    .prepare(
      `SELECT content, completed_at AS completedAt
       FROM tasks
       WHERE completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?
       ORDER BY completed_at ASC`,
    )
    .all(from, to) as PeriodData["completedTasks"];

  const measurements = db
    .prepare(
      `SELECT metric, value, unit, recorded_at AS recordedAt
       FROM measurements
       WHERE recorded_at >= ? AND recorded_at < ?
       ORDER BY recorded_at ASC`,
    )
    .all(from, to) as PeriodData["measurements"];

  // For a weekly reflection, include the daily reflections within the same window
  // (the agent should build on its own prior summaries rather than re-synthesize raw data).
  const priorReflections = db
    .prepare(
      `SELECT kind, body, period_end AS periodEnd
       FROM reflections
       WHERE period_end >= ? AND period_end < ?
       ORDER BY period_end ASC`,
    )
    .all(from, to) as PeriodData["priorReflections"];

  const data: PeriodData = { messages, facts, completedTasks, measurements, priorReflections };

  // Include financial data for weekly/monthly reflections
  if (includeFinancial) {
    const financialAccounts = db
      .prepare(
        `SELECT display_name AS displayName, type, balance
         FROM accounts
         WHERE status = 'active'
         ORDER BY type ASC`,
      )
      .all() as Array<{ displayName: string; type: string; balance: number }>;

    const financialInsights = db
      .prepare(
        `SELECT topic, body, category, priority
         FROM financial_insights
         WHERE dismissed_at IS NULL
         ORDER BY priority DESC, created_at DESC
         LIMIT 5`,
      )
      .all() as Array<{ topic: string; body: string; category: string; priority: number }>;

    const txns = db
      .prepare(
        `SELECT category, SUM(ABS(amount)) as total
         FROM transactions
         WHERE date >= ? AND date < ?
         GROUP BY category
         ORDER BY total DESC
         LIMIT 5`,
      )
      .all(from, to) as Array<{ category: string; total: number }>;

    const totalSpent = txns.reduce((sum, t) => sum + t.total, 0);

    data.financialAccounts = financialAccounts;
    data.financialInsights = financialInsights;
    data.financialTransactionSummary = {
      totalSpent,
      topCategories: txns.map((t) => ({ category: t.category || "uncategorized", amount: t.total })),
    };
  }

  return data;
};

// ─── Prompt composition ──────────────────────────────────────────────────────

const MAX_INPUT_CHARS = 80_000;

const formatTimestamp = (ms: number): string => {
  const d = new Date(ms);
  return d.toISOString().slice(0, 16).replace("T", " ");
};

const renderData = (data: PeriodData): string => {
  const parts: string[] = [];

  if (data.priorReflections.length > 0) {
    parts.push("## Prior reflections within this period");
    for (const r of data.priorReflections) {
      parts.push(`### ${r.kind} reflection ending ${formatTimestamp(r.periodEnd)}`);
      parts.push(r.body);
    }
  }

  if (data.facts.length > 0) {
    parts.push("\n## New facts learned");
    for (const f of data.facts) {
      parts.push(`- [${f.category}/${f.subject}] ${f.body}`);
    }
  }

  if (data.completedTasks.length > 0) {
    parts.push("\n## Tasks completed");
    for (const t of data.completedTasks) {
      parts.push(`- ${t.content}`);
    }
  }

  if (data.measurements.length > 0) {
    parts.push("\n## Measurements recorded");
    for (const m of data.measurements) {
      parts.push(`- ${m.metric}: ${m.value}${m.unit ? ` ${m.unit}` : ""}`);
    }
  }

  if (data.messages.length > 0) {
    parts.push("\n## Conversation (chronological)");
    for (const m of data.messages) {
      const ts = formatTimestamp(m.createdAt);
      const content = m.content.length > 800 ? m.content.slice(0, 800) + "…[truncated]" : m.content;
      parts.push(`[${ts}] ${m.role}: ${content}`);
    }
  }

  // Include financial data for weekly/monthly reflections
  if (data.financialAccounts && data.financialAccounts.length > 0) {
    parts.push("\n## Financial Status");
    const totalAssets = data.financialAccounts
      .filter((a) => a.type !== "debt" && a.type !== "credit_card")
      .reduce((sum, a) => sum + a.balance, 0);
    const totalLiabilities = data.financialAccounts
      .filter((a) => a.type === "debt" || a.type === "credit_card")
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);
    parts.push(`- Net worth: $${(totalAssets - totalLiabilities).toFixed(2)}`);

    if (data.financialTransactionSummary) {
      parts.push(`- Spending this period: $${data.financialTransactionSummary.totalSpent.toFixed(2)}`);
      if (data.financialTransactionSummary.topCategories.length > 0) {
        parts.push("- Top categories: " + data.financialTransactionSummary.topCategories
          .map((c) => `${c.category} ($${c.amount.toFixed(2)})`)
          .join(", "));
      }
    }

    if (data.financialInsights && data.financialInsights.length > 0) {
      parts.push("\n## Financial Insights");
      for (const insight of data.financialInsights) {
        const priorityLabel = insight.priority === 3 ? "URGENT" : insight.priority === 2 ? "WATCH" : "NOTE";
        parts.push(`- [${priorityLabel}] ${insight.topic}`);
      }
    }
  }

  let rendered = parts.join("\n");
  if (rendered.length > MAX_INPUT_CHARS) {
    rendered =
      rendered.slice(0, MAX_INPUT_CHARS) +
      `\n\n[truncated — original was ${rendered.length} chars]`;
  }
  return rendered;
};

const buildPrompt = (
  kind: ReflectionKind,
  from: number,
  to: number,
  identityProfile: string,
  rendered: string,
): string => {
  const label = KIND_LABEL[kind];
  return `You are writing a ${label}'s reflection for a single user.

## Who the user is
${identityProfile}

## Period
${formatTimestamp(from)} → ${formatTimestamp(to)}

## What happened during this ${label}
${rendered}

---

Call \`record_reflection\` with a structured summary. Be honest, specific, and concise. Speak about the user as "you" (second person). Highlight what *shifted* during this ${label}, not a play-by-play. Connect threads across conversations and data when you can. If the period is genuinely empty, emit minimal output — don't manufacture insight.`;
};

// ─── Generator ──────────────────────────────────────────────────────────────

export interface ReflectorOptions {
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

export class Reflector {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxRetries: number;

  constructor(opts: ReflectorOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxRetries = opts.maxRetries ?? 4;
  }

  /**
   * Generate a structured reflection over [from, to). Persists to the
   * reflections table and returns the resulting Reflection row.
   */
  async generate(
    storage: Storage,
    identity: IdentityMemory,
    kind: ReflectionKind,
    from: number,
    to: number,
  ): Promise<Reflection> {
    if (to <= from) {
      throw new LifecoachError(
        `Reflection period 'to' (${to}) must be after 'from' (${from})`,
        "INVALID_PERIOD",
      );
    }

    const includeFinancial = kind === "weekly" || kind === "monthly";
    const data = gatherPeriodData(storage, from, to, includeFinancial);
    const rendered = renderData(data);
    const prompt = buildPrompt(kind, from, to, identity.render(), rendered);

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          tools: [
            {
              name: "record_reflection",
              description: "Record a structured reflection for the given period.",
              input_schema: TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: "record_reflection" },
          messages: [{ role: "user", content: prompt }],
        }),
      { maxAttempts: this.maxRetries },
    );

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LifecoachError(
        "Reflector: model did not call record_reflection",
        "REFLECTION_NO_TOOL_USE",
      );
    }
    const parsed = reflectionPayloadSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new LifecoachError(
        `Reflector: invalid payload — ${parsed.error.message}`,
        "REFLECTION_INVALID_PAYLOAD",
      );
    }

    const body = composeBody(parsed.data);
    const reflection = storage.reflections.create({
      periodStart: from,
      periodEnd: to,
      kind,
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      themes: parsed.data.themes,
      wins: parsed.data.wins,
      concerns: parsed.data.concerns,
      openThreads: parsed.data.openThreads,
      body,
    });
    return reflection;
  }
}

/**
 * Compose the structured payload into a single markdown body. We store as
 * markdown (not JSON) so the body is directly renderable in chat + agent
 * system-prompt context. The structured fields are still queryable by markdown
 * parsing on the client when we render the cards.
 */
const composeBody = (p: ReflectionPayload): string => {
  const sections: string[] = [];
  if (p.title) sections.push(`# ${p.title}`);
  sections.push(p.body.trim());
  if (p.themes.length > 0) {
    sections.push("## Themes\n" + p.themes.map((t) => `- ${t}`).join("\n"));
  }
  if (p.wins.length > 0) {
    sections.push("## Wins\n" + p.wins.map((w) => `- ${w}`).join("\n"));
  }
  if (p.openThreads.length > 0) {
    sections.push("## Open threads\n" + p.openThreads.map((t) => `- ${t}`).join("\n"));
  }
  if (p.concerns.length > 0) {
    sections.push("## Concerns\n" + p.concerns.map((c) => `- ${c}`).join("\n"));
  }
  return sections.join("\n\n");
};

// ─── Convenience: default windows for daily / weekly / monthly ──────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Default period boundaries for each kind, anchored to "now".
 *   - daily:   yesterday 00:00 → today 00:00
 *   - weekly:  7 days back from today 00:00
 *   - monthly: 30 days back from today 00:00
 *
 * Anchored to local time. Use `kindWindow(kind)` if you want defaults;
 * callers can always pass an explicit (from, to) instead.
 */
export const kindWindow = (
  kind: ReflectionKind,
  now: Date = new Date(),
): { from: number; to: number } => {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const to = todayStart.getTime();
  const span =
    kind === "daily" ? ONE_DAY_MS : kind === "weekly" ? 7 * ONE_DAY_MS : 30 * ONE_DAY_MS;
  return { from: to - span, to };
};
