/**
 * Currency + percent formatting. Uses `Intl.NumberFormat` so values render with
 * locale-aware thousands separators ($1,234.56 — not $1234.5). Mirrors the
 * style of `time.ts`: pure, no deps.
 */

/**
 * Format a numeric amount as currency.
 *
 * @param value     numeric amount (e.g. 1234.5)
 * @param opts.currency  ISO 4217 code, default "USD"
 * @param opts.signed    when true, prefix "+" for positive and U+2212 minus for
 *                       negative (matches the existing transaction-row style:
 *                       "+$12.34" / "−$12.34"). When false, negative values
 *                       render with the locale's default minus glyph.
 */
export const formatCurrency = (
  value: number,
  opts: { currency?: string; signed?: boolean } = {},
): string => {
  const { currency = "USD", signed = false } = opts;
  const nf = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return nf.format(value);
  const abs = nf.format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
};

/**
 * Format a numeric percent (e.g. 12.5 → "12.5%"). Pass a raw percent value
 * (already multiplied by 100). When `signed` is true, prefix the sign.
 */
export const formatPercent = (
  value: number,
  opts: { fractionDigits?: number; signed?: boolean } = {},
): string => {
  const { fractionDigits = 1, signed = false } = opts;
  const abs = Math.abs(value).toFixed(fractionDigits);
  if (!signed) return `${value.toFixed(fractionDigits)}%`;
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return `${abs}%`;
};
