import type { Database } from "better-sqlite3";
import type { Profile, ProfileEntry } from "@lifecoach/schemas";
import { now } from "../../util/ids.js";

export class ProfileRepository {
  constructor(private readonly db: Database) {}

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO profile(key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), now());
  }

  get(key: string): unknown {
    const row = this.db
      .prepare("SELECT value FROM profile WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) return undefined;
    return JSON.parse(row.value);
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM profile WHERE key = ?").run(key);
  }

  all(): Profile {
    const rows = this.db.prepare("SELECT key, value FROM profile").all() as {
      key: string;
      value: string;
    }[];
    const out: Profile = {};
    for (const row of rows) {
      out[row.key] = JSON.parse(row.value);
    }
    return out;
  }

  entries(): ProfileEntry[] {
    const rows = this.db
      .prepare("SELECT key, value, updated_at FROM profile ORDER BY key")
      .all() as { key: string; value: string; updated_at: number }[];
    return rows.map((r) => ({
      key: r.key,
      value: JSON.parse(r.value),
      updatedAt: r.updated_at,
    }));
  }
}
