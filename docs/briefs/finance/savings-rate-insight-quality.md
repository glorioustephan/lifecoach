---
title: Savings-Rate Insight Quality — Correct Formulas, Transfer Hygiene, and Emission Guards
slug: savings-rate-insight-quality
audience: [agents, humans]
owner: financial-advisor
status: done
created: 2026-05-28
updated: 2026-05-28
source: authored
consumers: [memory-systems-engineer, mcp-protocol-engineer, integrations-engineer]
produces:
  mcp_tools:
    - financial_monthly_rollup
    - get_rollup_contributors
pair: []  # Paired specs intentionally not authored — brief + code + tests are the contract for this single-user tool.
code_paths:
  - packages/core/src/financial/
  - packages/core/src/agent/tools/financial.ts
  - packages/connectors/src/monarch/
  - packages/mcp-server/src/tools/financial/
last_implemented: 2026-05-28
---

## Problem

A production insight told the user their "monthly burn was $27,404" — a figure that was
actually March income, not expenses. The savings-rate drop from -14% to -25.3% "overnight"
was a rolling-window artifact caused by April's outlier month (taxes + doubled mortgage)
entering or leaving the trailing-30-day window, not a genuine behavioral deterioration.
The agent could not drill down to the transactions behind its own headline number. These
three failures — bad arithmetic, misleading temporal framing, and no queryable lineage —
are the target of this brief.

---

## Recommendation

### 1. Canonical definitions

All financial rollup tools must use exactly these formulas. No other definitions are
permitted in agent prompts or tool output.

```
monthly_income    = sum(tx.amount for tx where tx.amount > 0
                        AND NOT tx.is_transfer
                        AND tx.category NOT IN income_exclusions)

monthly_expenses  = sum(abs(tx.amount) for tx where tx.amount < 0
                        AND NOT tx.is_transfer
                        AND tx.category NOT IN expense_exclusions)

monthly_burn      = monthly_expenses          // expenses only; never income

savings_rate      = (monthly_income - monthly_expenses) / monthly_income
                    expressed as a percentage; requires monthly_income > 0
```

**Transfer exclusion (canonical rule):** Any transaction where `is_transfer = true`
in Monarch's data shape MUST be excluded from both income and expense totals.
This covers: account-to-account moves, credit-card payments (which appear as a debit
from checking and a credit to the card — both legs are transfers), and savings sweeps.
If `is_transfer` is not reliable (Monarch sometimes misclassifies), apply a secondary
filter: exclude any transaction whose `category` is `"Transfer"` or `"Credit Card
Payment"`, AND whose merchant or counterparty account ID appears in the user's own
`accounts[]` list. Double-counting a transfer inflates both income and expenses and
produces a fictional burn figure.

### 2. Income taxonomy (what counts vs. what does not)

| Counts as income | Must be excluded |
|---|---|
| Paycheck / direct deposit | Transfers in from own accounts |
| Business revenue deposits | Credit-card payment credits |
| Freelance / 1099 payments | Refunds (return to card) — these offset expense, not add income |
| Rental income | Reimbursements unless employer-flagged payroll |
| Interest / dividends (if user opts in) | Internal savings transfers |

Refunds should reduce the expense in the original category, not appear as income.
Reimbursements warrant a dedicated `"Reimbursement"` category excluded from income
unless the user explicitly opts in. The `"Transfer"` category in Monarch ($9,645 seen
in March) is the clearest signal of double-counting: flag any month where
`sum(transfer_category_txs) / monthly_income > 0.20` as a data-integrity warning before
computing savings rate.

### 3. Legitimate comparison windows

| Window | Use case | When it is misleading |
|---|---|---|
| Calendar-month (MTD) | Budget tracking, month-end review | Before the 15th: too little data; never narrate as a "rate" |
| Prior full calendar month | Month-over-month comparison | Fine if both months are complete |
| Trailing 30 days | Smoothed trend | Month-boundary flip: Apr 30 exits and May 1 enters simultaneously, creating a discontinuous jump with no behavioral cause |
| Trailing 90 days | Identifying structural shifts | Outlier months (tax payments, one-time large purchases) dominate; flag if any single month > 1.5× median |

**Rule for narratable daily deltas:** A delta in savings rate between two consecutive
days is narratable only if (a) the window is a complete prior calendar month vs. current
MTD with >= 15 days of current-month data, (b) no outlier month enters or exits the
window on that day, and (c) the delta is >= 5 percentage points after excluding
transfer-category noise. A rolling-30-day window crossing a month boundary almost
always produces an artifactual spike; the system must detect and suppress it.

### 4. Insight-emission rubric (emit only when ALL conditions pass)

| Guard | Condition | Why |
|---|---|---|
| G1 — Data completeness | MTD has >= 15 calendar days of transactions | Rates computed on < 15 days have too much variance to be directional |
| G2 — Transfer ratio | transfer_category_txs / gross_income_including_transfers < 0.20 | High transfer ratio indicates likely double-counting; results are unreliable |
| G3 — Outlier month not in window | No single month in the comparison window has expenses > 1.5x the 6-month median | Outlier months (tax season, one-time events) make trend language false |
| G4 — Window consistency | Both comparison points use the same window type (MTD vs. prior MTD, or trailing-30 vs. prior trailing-30) | Mixing window types produces category errors, not behavioral signal |
| G5 — Itemization available | The headline number has at least one queryable drill-down (see Section 5) | If the system cannot back the number, it must not cite it |
| G6 — Income > 0 | monthly_income > 0 after transfer exclusion | Division by zero or near-zero income produces nonsensical percentages |

If any guard fails, the system must either (a) silently suppress the insight or (b) surface
a data-quality notice instead: "Savings rate data is incomplete this month — check back
after the 15th."

### 5. Itemization contract

Every aggregate number the agent cites in any insight or chat response MUST satisfy:

1. **Queryable source:** the MCP tool or SQL query that produced the number must be
   logged alongside the insight, not just the result.
2. **Drill-down available:** if the user asks "what makes up that $X?", the system must
   return the contributing transaction rows (id, date, merchant, amount, category) without
   a separate manual query. This means rollup tools must return or cache `contributing_tx_ids[]`.
3. **No rollup-only narratives:** summary fields from Monarch's budget endpoint alone
   are not sufficient to cite a burn figure. The number must be derived from the
   transactions endpoint with the transfer filters applied.
4. **Date-filter validation:** before returning a zero-row result-set, the system must
   confirm the date range is correct and log a warning rather than silently computing
   a zero-based rate. The March "0 results" failure in the transcript was a silent failure
   of date-filter logic.

---

## Data shapes (informal)

```typescript
// Input from Monarch transactions endpoint (relevant fields)
type MonarchTransaction = {
  id: string
  date: string                 // "YYYY-MM-DD"
  merchant_name: string
  amount: number               // negative = expense, positive = income/transfer-in
  category: string
  account_id: string
  is_transfer: boolean         // MUST be respected; secondary: category === "Transfer"
  is_recurring: boolean
  tags: string[]
}

// Rollup output — must accompany every aggregate the agent narrates
type MonthlyRollup = {
  period: string               // "2026-03" | "2026-05-MTD"
  window_type: "calendar_month" | "mtd" | "trailing_30" | "trailing_90"
  days_in_window: number
  income: number               // transfer-excluded
  expenses: number             // transfer-excluded
  burn: number                 // == expenses
  savings_rate: number         // (income - expenses) / income
  transfer_total: number       // excluded amount; surfaced for guard G2
  transfer_ratio: number       // transfer_total / (income + transfer_total)
  guards_passed: GuardResult[]
  contributing_tx_ids: string[]  // all tx IDs used in this rollup
  outlier_month_detected: boolean
}

type GuardResult = {
  guard: "G1" | "G2" | "G3" | "G4" | "G5" | "G6"
  passed: boolean
  detail: string
}

// Insight emission — only created when all guards pass
type FinancialInsight = {
  id: string
  type: "savings_rate_trend" | "burn_alert" | "income_drop"
  headline: string
  rollup_ref: string           // period key into rollup store
  contributing_tx_ids: string[]
  guards_evaluated: GuardResult[]
  emitted_at: string
}
```

---

## Prompts / Rubrics

**System prompt addition for the financial agent tool:**

```
When citing any financial figure (burn, savings rate, income), you MUST:
1. State the exact window: "March 2026 calendar month", "May 2026 MTD (18 days)", etc.
2. State whether transfers were excluded and the transfer ratio.
3. Offer to list the contributing transactions if the user questions the number.
4. Never use "overnight" or "daily" framing for a savings rate unless the comparison
   is explicitly two identical rolling windows differing by exactly one day and the
   delta exceeds 5 percentage points from a non-boundary cause.
5. If a guard did not pass, say "I don't have enough reliable data to state a savings
   rate for this period" rather than citing an unreliable figure.
```

**Rubric for evaluating a generated insight (0 = fail, 1 = pass):**

| Criterion | Pass condition |
|---|---|
| Formula correctness | Burn = expenses only; savings rate uses transfer-excluded income |
| Window stated | Insight names the exact date range and window type |
| Transfer exclusion confirmed | Tool output shows transfer_ratio < 0.20 |
| Guards documented | All six guards evaluated and logged |
| Itemization present | contributing_tx_ids[] non-empty and matches headline number |
| No conflation | Income and expenses cited separately; neither number reused as the other |

---

## Evaluation criteria

A correct implementation passes all of the following:

1. March 2026 rollup produces income ~$27,403, expenses ~$28,634, savings rate -4.5%
   with the $9,645 transfer category excluded from income.
2. April 2026 rollup is flagged as an outlier month (expenses > 1.5× 6-month median).
3. A trailing-30-day window that crosses the March/April boundary is tagged
   `outlier_month_detected: true` and suppresses any "new low" insight emission.
4. The date-filter bug returns a logged warning rather than a silent zero-row result.
5. Any insight citing a dollar figure can be drilled down to its `contributing_tx_ids`
   in a single follow-up tool call.

---

## Risks & open questions

- **Monarch `is_transfer` reliability:** field may be missing or wrong on some
  connectors or manual imports. The fallback category filter is a heuristic;
  integrations-engineer should validate coverage rate against a known dataset.
- **Refund treatment:** currently specified as expense offset, not income. Edge cases
  exist (large refunds in months with no purchases in that category). Defer to a
  separate brief if this causes material distortion.
- **Outlier threshold (1.5×):** chosen conservatively; may need tuning after reviewing
  real user data. Tax months and large one-time purchases may warrant a user-configurable
  threshold or a calendar-aware rule (April = tax month).
- **MTD 15-day floor:** conservative. A user may want earlier signals in the month.
  Consider making configurable but defaulting to 15.
- **Paired specs not authored.** See Closed scope below — intentional for a
  single-user tool.

---

## Handoff checklist

- [x] **memory-systems-engineer** — transfer exclusion added to finance-narrative
  rollup loop; narrative template updated to v2 (self-describing, transfer-excluded
  income/expenses + informational transfers line); stale narrative embeddings purged
  via migration `1779976662_purge_finance_narrative_embeddings.sql`; purge script
  for stale `monthly_burn`/`savings_rate` measurements at
  `scripts/purge-stale-financial-measurements.mjs` (ready, not yet run — awaiting
  integrations-engineer's snapshot-metrics fix); shared `isTransferTxn` helper
  extracted to `packages/core/src/financial/transfer.ts`; 3 Vitest tests added.
  NOTE: `contributing_tx_ids`, `guards_passed`, `transfer_ratio`,
  `outlier_month_detected` columns on rollup storage are scoped to a follow-up
  once mcp-protocol-engineer defines the `MonthlyRollup` storage contract.
- [x] **mcp-protocol-engineer** — G5 itemization contract implemented:
  `financial_monthly_rollup` tool added to `packages/core/src/agent/tools/financial.ts`
  returning the full `MonthlyRollup` shape (income, expenses, burn, savings_rate,
  contributing_tx_ids[], transfer_tx_ids[], guards G1–G6, outlier_month_detected,
  category_subtotals with per-category tx_ids[]). `get_rollup_contributors` drill-down
  tool added (same file) — takes month or from/to + optional category, returns full
  transaction rows for the contributing set. Both tools live in
  `packages/core/src/financial/rollup.ts` (pure, testable). `financial_savings_rate` and
  `financial_insight_emit` as separate MCP tools remain out of scope for this iteration;
  G5 guard is enforced at the Insighter prompt and tool level instead.
  NOTE: `financial_insight_emit` (a write-path guard tool) is deferred — see open scope below.
- [x] **integrations-engineer** — `is_transfer` wired through Monarch GraphQL +
  schema + storage (`1779979153_add_transactions_is_transfer.sql`); promoted to
  priority-1 signal in `isTransferTxn` with the existing categoryGroupType / name
  / internal-account cascade as fallbacks for older rows; silent date-filter
  failure addressed via `parseEpochInput` in `packages/core/src/agent/tools/`.
- [x] **technical-writer** — `docs/reference/schema.md` and
  `docs/reference/migrations.md` updated alongside each schema change.

---

## Closed scope (intentionally not implemented)

These follow-ups were considered and dropped as YAGNI for a single-user tool:

- **`financial_insight_emit` write-path tool with G1–G6 enforcement.** G5 is enforced
  at the Insighter prompt layer (see `packages/core/src/memory/insighter.ts`), which
  is sufficient. A second enforcement point would be belt-and-suspenders.
- **`docs/specs/financial-rollup-contract.md` and `docs/specs/insight-emission-guards.md`.**
  Brief + `rollup.ts` + tests already form the de-facto contract. Authoring normative
  specs for a single-user tool is process for process' sake.
- **Calendar-month boundary timezone.** Resolved: **local time** (`startOfCurrentMonthMs()`
  in `snapshot-metrics.ts` anchors to local-midnight on the 1st). This matches what
  the user sees in Monarch's calendar view. The known westward-timezone edge case
  (UTC-stored transactions near local midnight on the 1st) is documented at the call
  site and accepted as immaterial for this user's tz.
