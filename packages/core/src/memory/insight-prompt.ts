/**
 * Anthropic tool-use plumbing for the Insighter: the Zod schema, the matching
 * Anthropic JSON-schema, and the prompt-builder function. Extracted from
 * `insighter.ts` (Wave 5.3) so the contract surface lives in one place and
 * the generator class stays focused on transport (Anthropic SDK call +
 * retry).
 *
 * The Zod schema is the ONLY validator the generator trusts when the model
 * returns. The Anthropic JSON-schema below is a hand-mirrored projection of
 * the Zod schema (Anthropic's tool API takes plain JSON Schema, not Zod).
 * They MUST stay in sync — any change to one requires the other.
 */

import { z } from "zod";
import { evidenceRefSchema, insightPriority } from "@lifecoach/schemas";

export const insightPayloadSchema = z.object({
  insights: z
    .array(
      z.object({
        topic: z.string().min(1),
        body: z.string().min(1),
        rationale: z.string().optional(),
        priority: insightPriority.default(1),
        sourceFactIds: z.array(z.string()).default([]),
        evidenceRefs: z.array(evidenceRefSchema).default([]),
      }),
    )
    .max(5),
});
export type InsightPayload = z.infer<typeof insightPayloadSchema>;

/**
 * JSON Schema fed to Anthropic's `tools[].input_schema`. Must mirror
 * `insightPayloadSchema` exactly — when one changes, the other must too.
 */
export const INSIGHT_TOOL_INPUT_SCHEMA = {
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
              "1–2 paragraphs, addressed to the user. Specific. Cite numbers/dates where you can.",
          },
          rationale: {
            type: "string",
            description: "One sentence: why this matters now.",
          },
          priority: {
            type: "number",
            enum: [1, 2, 3],
            description: "1 = notice, 2 = worth noting, 3 = needs attention.",
          },
          sourceFactIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Fact IDs that anchor this insight. Cite the `[id=…]` tags from the Active facts section.",
          },
          evidenceRefs: {
            type: "array",
            description:
              "Concrete evidence pointers so the user can see why this surfaced. Use the `[id=…]`, `[goal=…]`, `[account=…]`, `[budget=…]`, `[holding=…]`, `[signal=…]` tags from the context.",
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

export const buildInsighterPrompt = (identityProfile: string, rendered: string): string =>
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
6. **Same-subject suppression.** If a "Prior insight" already covers the same subject and the underlying data has not materially changed, return zero insights for that subject — do not rewrite it under a new headline. The system also enforces this server-side.
7. **No fabricated dates.** Never write a specific date that does not appear in the data above. If you need to describe staleness, copy the parenthetical "(Nd ago)" annotation the renderer already produced.

**Goal-specific framings** (use sparingly — these aren't required every pass, but they're the right *shape* when the data points to them):

- **"Goal has gone quiet."** Use when the goal-state row shows \`stalled=true\` AND there's no plausible reason in recent messages — the goal hasn't been mentioned and no linked task moved. Topic format: \`Quiet: <goal title>\`. Be specific about the last-touch age. Cite the goal via \`refType=goal\`.
- **"No next action on <goal title>."** Use when a goal has \`linkedActiveTaskCount=0\` AND \`milestonesTotal\` is also 0 or stale (no done in 14d). The user committed to something but never decomposed it. Topic format: \`No next action: <goal title>\`. Suggest decomposition in the body.
- **"Untouched obstacle on <goal title>."** Use when the goal has a non-null \`obstacle\` AND none of the recent goal evidence rows or messages mention handling it. This is the WOOP mental-contrasting cue going stale. Topic format: \`Obstacle untouched: <goal title>\`. Quote the obstacle text.

These are *framings*, not enum values — keep the existing topic-as-free-text contract. Skip them when nothing fits; never invent one to fill a slot.

**Financial observations.** Financial state appears as "Financial state (rollups)" above with citable IDs (\`account=…\`, \`budget=…\`, \`holding=…\`). Treat money like any other life signal — when a financial pattern coincides with a life pattern (sleep, stress, a goal, a recurring theme in messages), that coincidence IS the insight; that's the thing only this coach can see. No financial advice, just observations and simple math. Be especially honest about uncertainty: category rollups depend on Monarch's categorization which can be wrong. When you cite a category number, **invite the user to challenge it** (e.g. "If 'Dining $1,036' looks high, tell me which transactions don't belong and I'll recategorize them so the picture stays accurate"). For recurring-expense downgrade suggestions (from the "Recurring expenses ≥$50/mo" list), use the **exact topic format \`Recurring: <Merchant>\`** (so the system can suppress the same suggestion for ~9 months after a dismissal) and surface **at most one** such item per pass with a clear monthly dollar figure. Don't do the alternative research in this pass — the chat agent does it lazily when the user clicks Discuss.

**G5 itemization guard (mandatory).** Before citing any dollar figure (burn, income, savings rate, category subtotal) as a headline in an insight body:
1. Call \`financial_monthly_rollup\` for the period in question to get the canonical rollup with \`contributing_tx_ids[]\` and guards G1–G6.
2. If any guard fails — especially G1 (< 15 days), G2 (high transfer ratio), or G5 (no contributors) — do NOT cite the figure. Surface the guard failure instead: "Savings rate data is incomplete this month — check back after the 15th."
3. If all guards pass, you may cite the figure. The contributing_tx_ids[] are available via \`get_rollup_contributors\` for any follow-up drill-down — tell the user this is available.
4. Never emit a financial headline number derived only from the rolled-up context summary above without this verification step.

If genuinely nothing notable jumps out, return an empty array. That's a valid answer.`;
