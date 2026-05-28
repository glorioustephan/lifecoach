/**
 * Shared transfer-exclusion helpers for financial rollup logic.
 *
 * Any transaction that represents a cash movement between the user's own
 * accounts (Ally→checking sweeps, credit-card payments, loan-principal
 * payments, balance adjustments) MUST be excluded from income and expense
 * totals before computing monthly_burn or savings_rate. Counting both legs
 * of an internal transfer inflates both figures and produces fictional burn
 * numbers.
 *
 * Detection uses a four-tier priority cascade:
 *  0. `isTransfer === true` — Monarch's own boolean flag, most authoritative.
 *     Added to GraphQL query and persisted as `is_transfer` (migration
 *     1779979153). Null/undefined on older rows — falls through to tier 1.
 *  1. `categoryGroupType === "transfer"` — reliable when Monarch populates
 *     the category group (live-synced rows).
 *  2. Category name substring match — fallback for null-categoryGroupType
 *     rows (older syncs, manual accounts, re-synced rows before migration
 *     1779971644 added the `category_group_type` column).
 *  3. Account-pair cross-reference — if the transaction's accountId is one
 *     of the user's own internal account IDs the caller supplies, it is a
 *     transfer regardless of category. Catches SoFi↔Ally sweeps that Monarch
 *     sometimes mis-categorises.
 */

/**
 * Category-name substrings that identify a transfer when Monarch's
 * `categoryGroupType` field is absent or null (older synced rows).
 *
 * Rationale for each pattern:
 * - "internal transfer" / "account transfer" / "transfers" / "transfer" —
 *   Monarch labels for account-to-account sweeps (Ally→checking, SoFi→joint).
 *   Longer/more-specific variants are listed first so they match before the
 *   shorter "transfer" substring would.
 * - "credit card payment" — debit from checking that pays a card balance; the
 *   matching credit on the card side also carries this label.
 * - "credit card" (standalone) — older Monarch syncs use this short form.
 * - "loan payment" — SoFi loan principal payments; debt-principal is not an
 *   expense in the savings-rate formula (it reduces liability, not consumption).
 * - "balance adjustment" — manual correction rows Monarch inserts on re-sync.
 *
 * Note: "payment" alone is intentionally NOT included — too broad and would
 * catch legitimate vendor payments.
 */
export const TRANSFER_CATEGORY_NAME_PATTERNS: readonly string[] = [
  "internal transfer",
  "account transfer",
  "transfers",
  "transfer",
  "credit card payment",
  "credit card",
  "loan payment",
  "balance adjustment",
];

/**
 * Returns true when a transaction is a transfer between the user's own
 * accounts and should be excluded from income/expense rollups.
 *
 * @param t - Transaction shape. Accepts the minimal fields present on both
 *   `Transaction` (schemas package) and the inline objects used in
 *   snapshot-metrics, so callers in either context can import directly.
 * @param internalAccountIds - Optional set of account IDs (internal UUIDs
 *   and/or external IDs) that belong to the user. When provided, any
 *   transaction whose `accountId` is in this set is treated as a transfer
 *   regardless of category label (tier-3 account-pair cross-reference).
 *   Defaults to an empty set (tier-3 check is a no-op) for callers like
 *   `finance-narratives` that do not maintain an account-ID set.
 */
export const isTransferTxn = (
  t: {
    isTransfer?: boolean | null;
    categoryGroupType?: string | null;
    category?: string | null;
    accountId?: string | null;
  },
  internalAccountIds: ReadonlySet<string> = new Set<string>(),
): boolean => {
  // Tier 0: Monarch's own boolean flag — most authoritative, short-circuits
  // all heuristics when present. Only available on rows synced after migration
  // 1779979153; null/undefined falls through.
  if (t.isTransfer === true) {
    return true;
  }

  // Tier 1: category-group type — most reliable when present.
  if (t.categoryGroupType) {
    return t.categoryGroupType.toLowerCase() === "transfer";
  }

  // Tier 2: category name substring match — covers null-categoryGroupType rows.
  if (t.category) {
    const cat = t.category.toLowerCase();
    if (TRANSFER_CATEGORY_NAME_PATTERNS.some((p) => cat.includes(p))) {
      return true;
    }
  }

  // Tier 3: account-pair cross-reference — catches sweeps regardless of
  // category label (e.g. SoFi↔Ally sweeps mis-categorised by Monarch).
  if (t.accountId && internalAccountIds.has(t.accountId)) {
    return true;
  }

  return false;
};
