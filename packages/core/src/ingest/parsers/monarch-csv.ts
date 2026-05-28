import Papa from "papaparse";

/**
 * Parse a Monarch Money transaction export (CSV) into structured rows.
 * Distinct from the generic `csv.ts` parser which produces embedding text —
 * this one returns typed financial rows the backfill pipeline can upsert
 * directly into the `transactions` + `measurements` tables.
 *
 * Monarch's export headers (case-insensitive, may vary slightly across
 * exports/years): Date, Merchant, Category, Account, Original Statement,
 * Notes, Amount, Tags. Amount is signed — negative for expense, positive
 * for income.
 */
export interface ParsedMonarchCsvRow {
  /** Unix-ms timestamp at start of day for the txn date. */
  date: number;
  /** Original ISO date string (YYYY-MM-DD) for stable dedup hashing. */
  dateRaw: string;
  merchant: string;
  category: string | null;
  account: string;
  amount: number;
  notes: string | null;
  originalStatement: string | null;
}

const norm = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

const findHeader = (headers: string[], wanted: string[]): string | undefined => {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const w of wanted) {
    const i = lowered.indexOf(w.toLowerCase());
    if (i >= 0) return headers[i];
  }
  return undefined;
};

const toAmount = (raw: unknown): number => {
  if (typeof raw === "number") return raw;
  const s = norm(raw).replace(/[$,]/g, "");
  if (!s) return NaN;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

const parseDateMs = (raw: string): number => {
  if (!raw) return NaN;
  // Monarch uses YYYY-MM-DD; new Date("YYYY-MM-DD") parses as UTC midnight.
  // Treat as local midnight so monthly bucketing matches the user's intent.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const t = Date.parse(raw);
  return Number.isNaN(t) ? NaN : t;
};

export interface ParseMonarchCsvResult {
  rows: ParsedMonarchCsvRow[];
  skipped: number;
  totalRows: number;
}

export const parseMonarchCsv = (rawText: string): ParseMonarchCsvResult => {
  const parsed = Papa.parse(rawText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const raw = (parsed.data as Record<string, unknown>[]) ?? [];
  if (raw.length === 0) return { rows: [], skipped: 0, totalRows: 0 };

  const headers = Object.keys(raw[0] as Record<string, unknown>);
  const hDate = findHeader(headers, ["Date"]);
  const hMerchant = findHeader(headers, ["Merchant", "Description"]);
  const hCategory = findHeader(headers, ["Category"]);
  const hAccount = findHeader(headers, ["Account", "Account Name"]);
  const hAmount = findHeader(headers, ["Amount"]);
  const hNotes = findHeader(headers, ["Notes", "Note"]);
  const hOriginalStatement = findHeader(headers, ["Original Statement", "Statement"]);

  if (!hDate || !hAmount) {
    return { rows: [], skipped: raw.length, totalRows: raw.length };
  }

  const rows: ParsedMonarchCsvRow[] = [];
  let skipped = 0;
  for (const r of raw) {
    const dateRaw = norm(r[hDate]);
    const amount = toAmount(r[hAmount]);
    if (!dateRaw || Number.isNaN(amount)) {
      skipped += 1;
      continue;
    }
    const date = parseDateMs(dateRaw);
    if (!Number.isFinite(date)) {
      skipped += 1;
      continue;
    }
    rows.push({
      date,
      dateRaw,
      merchant: hMerchant ? norm(r[hMerchant]) || "Unknown" : "Unknown",
      category: hCategory ? norm(r[hCategory]) || null : null,
      account: hAccount ? norm(r[hAccount]) : "",
      amount,
      notes: hNotes ? norm(r[hNotes]) || null : null,
      originalStatement: hOriginalStatement ? norm(r[hOriginalStatement]) || null : null,
    });
  }
  return { rows, skipped, totalRows: raw.length };
};
