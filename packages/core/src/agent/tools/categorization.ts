import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import { toolError } from "./errors.js";

/**
 * User-correction tool surface for the financial-insight challenge loop.
 *
 * Premise: Monarch's categorization is often wrong (e.g. restaurant-grocery
 * runs counted as "Dining", services miscategorized as "Travel"). When the
 * coach raises an insight built on a category number, the user must be able
 * to **conversationally** correct the underlying data and have the system
 * honor it forever, including across re-syncs.
 *
 * Two layers, both applied at READ time so the synced data is never mutated:
 *   - Per-transaction overrides (highest precedence)
 *   - Merchant pattern rules (case-insensitive substring; optional account scope)
 *
 * After applying corrections in chat, the agent should typically also call
 * `dismiss_insight` on the now-stale insight; the next 07:30 Insighter pass
 * regenerates from the corrected view.
 */
export const buildCategorizationTools = (storage: Storage) => [
  tool(
    "list_category_breakdown",
    "Show recent transactions in a given category so the user can pick which are miscategorized. Use this BEFORE proposing recategorizations — never guess what's in a bucket.",
    {
      category: z.string().min(1).describe("Category name as it appears in the user's data (case-sensitive)."),
      days: z.number().int().min(1).max(365).optional().describe("Days back to look. Defaults to 30."),
    },
    async ({ category, days }) => {
      const from = Date.now() - (days ?? 30) * 24 * 60 * 60 * 1000;
      const txns = storage.financial.queryTransactions({ from, category });
      if (txns.length === 0) {
        return {
          content: [
            { type: "text", text: `No transactions found in "${category}" in the last ${days ?? 30} days.` },
          ],
        };
      }
      const total = txns.reduce((s, t) => s + Math.abs(t.amount), 0);
      const lines = txns
        .slice(0, 50)
        .map(
          (t) =>
            `[txn=${t.id}] ${new Date(t.date).toISOString().slice(0, 10)} · ${t.merchant} · $${Math.abs(t.amount).toFixed(2)}`,
        );
      return {
        content: [
          {
            type: "text",
            text: `${txns.length} txn(s) in "${category}", total $${total.toFixed(2)} (showing up to 50):\n\n${lines.join(
              "\n",
            )}\n\nUse override_transaction_category to correct individual rows, or apply_merchant_rule for "X is always Y" patterns.`,
          },
        ],
      };
    },
  ),

  tool(
    "override_transaction_category",
    "Set the user's corrected category for a single transaction. Highest-precedence correction — overrides any merchant rule and Monarch's original category. Survives re-syncs (we never mutate Monarch's synced data; effective category is computed at read time).",
    {
      txnId: z.string().min(1).describe("Local transaction id (the [txn=…] tag from list_category_breakdown)."),
      category: z.string().min(1).describe("Corrected category name."),
      note: z.string().optional().describe("Optional short note explaining the correction."),
    },
    async ({ txnId, category, note }) => {
      const txn = storage.financial.getTransaction(txnId);
      if (!txn) {
        return toolError(`[TXN_NOT_FOUND] No transaction with id ${txnId}`);
      }
      storage.financial.upsertTransactionOverride({
        transactionExternalId: txn.externalId,
        category,
        ...(note ? { notes: note } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: `Recategorized ${txn.merchant} ($${Math.abs(txn.amount).toFixed(2)}, ${new Date(
              txn.date,
            )
              .toISOString()
              .slice(0, 10)}) → "${category}". Survives re-syncs.`,
          },
        ],
      };
    },
  ),

  tool(
    "apply_merchant_rule",
    "Create a 'this merchant is always category X' rule. Matches transactions whose merchant name contains the pattern (case-insensitive). Applies to all present + future matching transactions at READ time — no historical mutation needed. Optional account scope.",
    {
      merchantPattern: z
        .string()
        .min(1)
        .describe(
          "Case-insensitive substring of the merchant name. Use the most specific phrase that uniquely identifies the merchant.",
        ),
      category: z.string().min(1).describe("Category to assign to matching transactions."),
      accountId: z
        .string()
        .optional()
        .describe("Optional account id to scope the rule to one account."),
      priority: z
        .number()
        .int()
        .optional()
        .describe("Tie-break when multiple rules match (higher = wins). Default 100."),
    },
    async ({ merchantPattern, category, accountId, priority }) => {
      const rule = storage.financial.createCategorizationRule({
        merchantPattern,
        category,
        ...(accountId ? { accountId } : {}),
        ...(priority !== undefined ? { priority } : {}),
      });
      // Count how many existing transactions this rule will affect (informational).
      const recentMatches = storage.financial
        .queryTransactions({ from: Date.now() - 365 * 24 * 60 * 60 * 1000 })
        .filter(
          (t) =>
            (!accountId || t.accountId === accountId) &&
            t.merchant.toLowerCase().includes(merchantPattern.toLowerCase()),
        ).length;
      return {
        content: [
          {
            type: "text",
            text: `Rule created [rule=${rule.id}]: merchant ~ "${merchantPattern}"${
              accountId ? ` (account=${accountId})` : ""
            } → "${category}" (priority ${rule.priority}). Affects ~${recentMatches} transactions in the last year and all future matches.`,
          },
        ],
      };
    },
  ),

  tool(
    "list_categorization_rules",
    "List all active categorization rules so the user can audit what's in effect.",
    {},
    async () => {
      const rules = storage.financial.listCategorizationRules();
      if (rules.length === 0) {
        return { content: [{ type: "text", text: "No categorization rules yet." }] };
      }
      const lines = rules.map(
        (r) =>
          `[rule=${r.id}] p${r.priority} "${r.merchantPattern}"${
            r.accountId ? ` (account=${r.accountId})` : ""
          } → "${r.category}"`,
      );
      return {
        content: [{ type: "text", text: `${rules.length} rule(s):\n\n${lines.join("\n")}` }],
      };
    },
  ),

  tool(
    "delete_categorization_rule",
    "Remove a categorization rule by id.",
    {
      ruleId: z.string().min(1),
    },
    async ({ ruleId }) => {
      const ok = storage.financial.deleteCategorizationRule(ruleId);
      return {
        content: [
          { type: "text", text: ok ? `Rule ${ruleId} removed.` : `No rule with id ${ruleId}.` },
        ],
      };
    },
  ),
];
