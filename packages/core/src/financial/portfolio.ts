/**
 * Account classification and net-worth computation — the single authoritative
 * implementation. Every caller that needs to know whether an account is a
 * liquid asset, a liability, or how to sum a net-worth figure MUST import
 * from this module rather than redefining the classification inline.
 *
 * Background: prior to consolidation the set `{"debt", "credit_card"}` and
 * its accompanying accumulation loop were duplicated across six modules
 * (insighter, reflector, finance-narratives, snapshot-metrics, the
 * financial agent tool, the Hono /financial route). A future change such as
 * treating margin-loan brokerage accounts as liabilities would silently
 * diverge across those sites. Centralising prevents that.
 */

import type { AccountType } from "@lifecoach/schemas";

/**
 * Account types whose balance counts AGAINST net worth. Balances on these
 * accounts represent money owed: credit-card statement balances, auto / student /
 * personal-loan principal, margin debt, etc. Stored balance signs are not
 * trusted (Monarch sometimes returns positives, sometimes negatives), so the
 * caller always uses `Math.abs(balance)` when summing liabilities.
 */
export const LIABILITY_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  "debt",
  "credit_card",
]);

/**
 * Account types treated as liquid savings — checking + savings. Excludes
 * investment accounts (held against market risk), retirement, and any
 * "other" bucket. Used to surface the cash-on-hand figure separately from
 * net worth.
 */
export const LIQUID_ASSET_TYPES: ReadonlySet<AccountType> = new Set([
  "checking",
  "savings",
]);

// Predicates accept `string` (not `AccountType`) because callers often work
// with raw row data where the column is typed `string` — typed `AccountType`
// callers still pass through cleanly via subtyping.
export const isLiabilityType = (type: string): boolean =>
  (LIABILITY_ACCOUNT_TYPES as ReadonlySet<string>).has(type);

export const isLiquidAssetType = (type: string): boolean =>
  (LIQUID_ASSET_TYPES as ReadonlySet<string>).has(type);

export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquidSavings: number;
}

/**
 * Reduce an account list to a net-worth summary. Accounts not in either
 * classification set still count toward `totalAssets` (the catch-all
 * "investment" / "other" buckets). Liabilities are always summed as
 * absolute values because the sign of credit-card balances is not stable
 * across Monarch syncs.
 *
 * Pass already-filtered accounts (e.g. `status === "active"`) if you want
 * to exclude closed accounts — this function does not filter by status.
 */
export const computeNetWorth = (
  accounts: ReadonlyArray<{ type: string; balance: number }>,
): NetWorthSummary => {
  let totalAssets = 0;
  let totalLiabilities = 0;
  let liquidSavings = 0;
  for (const a of accounts) {
    if (isLiabilityType(a.type)) {
      totalLiabilities += Math.abs(a.balance);
    } else {
      totalAssets += a.balance;
    }
    if (isLiquidAssetType(a.type)) {
      liquidSavings += a.balance;
    }
  }
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    liquidSavings,
  };
};
