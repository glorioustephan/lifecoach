/**
 * Recurring-charge frequency normalisation. Used by the Insighter (when
 * identifying subscription-creep candidates) and by the finance-narratives
 * indexer (when summarising monthly recurring spend). Keys come from
 * Monarch's recurringTransactionStream.frequency, lowercased.
 *
 * Multipliers convert "one occurrence at this frequency" → "monthly cost".
 * For a $30 weekly charge: 30 × (52/12) ≈ $130/mo.
 *
 * Kept here as a single source so a future change (e.g. adding "daily") lands
 * in exactly one place.
 */

export const RECURRING_FREQUENCY_TO_MONTHLY: Readonly<Record<string, number>> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
  bimonthly: 0.5,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
  yearly: 1 / 12,
};

/**
 * Estimate a merchant's monthly cost from `count` observed charges totaling
 * `totalAbs` (always absolute value — outflow sign is already encoded in the
 * accumulation). When `freq` is known we use it; otherwise we fall back to a
 * 90-day average (≈ 3 months) since the Insighter calls this on a 90-day
 * window. Pass an explicit `fallbackMonths` if the calling window differs.
 */
export const normalizeToMonthlyAmount = (
  totalAbs: number,
  count: number,
  freq?: string,
  fallbackMonths = 3,
): number => {
  if (count <= 0) return 0;
  const key = freq?.toLowerCase();
  const mul = key ? RECURRING_FREQUENCY_TO_MONTHLY[key] : undefined;
  if (mul !== undefined) return (totalAbs / count) * mul;
  return totalAbs / fallbackMonths;
};
