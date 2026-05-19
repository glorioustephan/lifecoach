import type { Profile, ProfileEntry } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";

export class IdentityMemory {
  constructor(private readonly storage: Storage) {}

  get(): Profile {
    return this.storage.profile.all();
  }

  entries(): ProfileEntry[] {
    return this.storage.profile.entries();
  }

  set(key: string, value: unknown): void {
    this.storage.profile.set(key, value);
  }

  unset(key: string): void {
    this.storage.profile.delete(key);
  }

  /** Render the profile as a compact human-readable block for the system prompt. */
  render(): string {
    const entries = this.entries();
    if (entries.length === 0) {
      return "(No profile facts on record yet. Ask the user for basics: name, dosha, allergies, goals.)";
    }
    const lines: string[] = [];
    for (const e of entries) {
      const valueText =
        typeof e.value === "string"
          ? e.value
          : JSON.stringify(e.value);
      lines.push(`- ${e.key}: ${valueText}`);
    }
    return lines.join("\n");
  }
}
