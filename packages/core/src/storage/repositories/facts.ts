import type { Database } from "better-sqlite3";
import type { Fact, FactCategory, FactUpdate, NewFact } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";

interface FactRow {
  id: string;
  category: string;
  subject: string;
  body: string;
  data: string | null;
  source: string | null;
  confidence: number;
  valid_from: number | null;
  valid_to: number | null;
  created_at: number;
}

const rowToFact = (row: FactRow): Fact => ({
  id: row.id,
  category: row.category as FactCategory,
  subject: row.subject,
  body: row.body,
  data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : undefined,
  source: row.source ?? undefined,
  confidence: row.confidence,
  validFrom: row.valid_from,
  validTo: row.valid_to,
  createdAt: row.created_at,
});

export class FactRepository {
  constructor(private readonly db: Database) {}

  create(fact: NewFact): Fact {
    const id = newId();
    const createdAt = now();
    this.db
      .prepare(
        `INSERT INTO facts(id, category, subject, body, data, source, confidence, valid_from, valid_to, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        fact.category,
        fact.subject,
        fact.body,
        fact.data ? JSON.stringify(fact.data) : null,
        fact.source ?? null,
        fact.confidence ?? 1.0,
        fact.validFrom ?? null,
        fact.validTo ?? null,
        createdAt,
      );
    return { ...fact, id, createdAt, confidence: fact.confidence ?? 1.0 };
  }

  get(id: string): Fact | undefined {
    const row = this.db
      .prepare(
        "SELECT id, category, subject, body, data, source, confidence, valid_from, valid_to, created_at FROM facts WHERE id = ?",
      )
      .get(id) as FactRow | undefined;
    return row ? rowToFact(row) : undefined;
  }

  softDelete(id: string): void {
    this.db.prepare("UPDATE facts SET valid_to = ? WHERE id = ?").run(now(), id);
  }

  /**
   * In-place correction of an existing fact. Only the columns present in
   * `patch` are written, so a caller can change just the body without
   * touching subject/category. Returns the fresh row, or null if the id
   * doesn't exist (or has been soft-deleted — soft-deleted rows are not
   * editable; restore via undelete first if we ever add that).
   */
  update(id: string, patch: FactUpdate): Fact | null {
    const existing = this.db
      .prepare("SELECT id, valid_to FROM facts WHERE id = ?")
      .get(id) as { id: string; valid_to: number | null } | undefined;
    if (!existing || existing.valid_to !== null) return null;

    const sets: string[] = [];
    const args: unknown[] = [];
    if (patch.subject !== undefined) {
      sets.push("subject = ?");
      args.push(patch.subject);
    }
    if (patch.body !== undefined) {
      sets.push("body = ?");
      args.push(patch.body);
    }
    if (patch.category !== undefined) {
      sets.push("category = ?");
      args.push(patch.category);
    }
    if (patch.confidence !== undefined) {
      sets.push("confidence = ?");
      args.push(patch.confidence);
    }
    if (patch.data !== undefined) {
      sets.push("data = ?");
      args.push(patch.data ? JSON.stringify(patch.data) : null);
    }
    if (sets.length === 0) return this.get(id) ?? null;

    args.push(id);
    this.db.prepare(`UPDATE facts SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    return this.get(id) ?? null;
  }

  byCategory(category: FactCategory, includeExpired = false): Fact[] {
    const where = includeExpired ? "category = ?" : "category = ? AND valid_to IS NULL";
    const rows = this.db
      .prepare(
        `SELECT id, category, subject, body, data, source, confidence, valid_from, valid_to, created_at
         FROM facts WHERE ${where} ORDER BY created_at DESC`,
      )
      .all(category) as FactRow[];
    return rows.map(rowToFact);
  }

  /**
   * Keyword fallback used when no embedder is configured.
   * Case-insensitive substring match across subject + body.
   */
  keywordSearch(query: string, limit = 10): Fact[] {
    const pattern = `%${query.toLowerCase()}%`;
    const rows = this.db
      .prepare(
        `SELECT id, category, subject, body, data, source, confidence, valid_from, valid_to, created_at
         FROM facts
         WHERE (LOWER(subject) LIKE ? OR LOWER(body) LIKE ?) AND valid_to IS NULL
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(pattern, pattern, limit) as FactRow[];
    return rows.map(rowToFact);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM facts WHERE valid_to IS NULL").get() as {
      c: number;
    };
    return row.c;
  }
}
