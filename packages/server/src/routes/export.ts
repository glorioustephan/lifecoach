import JSZip from "jszip";
import { Hono } from "hono";
import type { Lifecoach } from "@lifecoach/core";

const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const slug = (s: string): string =>
  s
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";

/**
 * Markdown export: dumps the DB's textual content into a downloadable zip —
 *   documents/      ingested corpus (round-trips back through import)
 *   reflections/    daily/weekly/monthly syntheses
 *   conversations/  chat transcripts
 * Intended for backups. Structured stores (facts, profile, financial) are not
 * included since they don't round-trip as markdown.
 */
export const exportRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const zip = new JSZip();
    const used = new Set<string>();
    const uniq = (folder: string, name: string): string => {
      let n = name;
      let i = 2;
      while (used.has(`${folder}/${n}`)) {
        n = name.replace(/\.md$/, `-${i}.md`);
        i += 1;
      }
      used.add(`${folder}/${n}`);
      return n;
    };

    // Documents — skip title-only stubs (e.g. the old Capacities mirror).
    for (const d of lc.storage.documents.list({ limit: 100000 })) {
      if (d.metadata && d.metadata["contentMirrored"] === false) continue;
      const frontmatter = [
        "---",
        `title: ${JSON.stringify(d.title ?? "")}`,
        `source: ${d.source}`,
        ...(d.externalSource ? [`externalSource: ${d.externalSource}`] : []),
        `ingestedAt: ${new Date(d.ingestedAt).toISOString()}`,
        "---",
      ].join("\n");
      const name = uniq("documents", `${slug(d.title ?? d.id)}.md`);
      zip.file(`documents/${name}`, `${frontmatter}\n\n${d.body}\n`);
    }

    // Reflections
    for (const r of lc.storage.reflections.all()) {
      const name = uniq("reflections", `${r.kind}-${ymd(r.periodEnd)}.md`);
      zip.file(`reflections/${name}`, `${r.body}\n`);
    }

    // Conversations — skip empty sessions; include archived.
    for (const s of lc.storage.sessions.recent(100000, true)) {
      const msgs = lc.storage.messages.forSession(s.id);
      if (msgs.length === 0) continue;
      const transcript = msgs.map((m) => `## ${m.role}\n\n${m.content.trim()}`).join("\n\n");
      const heading = s.summary?.trim() ? ` — ${s.summary.trim().slice(0, 60)}` : "";
      const name = uniq("conversations", `${ymd(s.startedAt)}-${s.id.slice(0, 8)}.md`);
      zip.file(`conversations/${name}`, `# Conversation ${ymd(s.startedAt)}${heading}\n\n${transcript}\n`);
    }

    const data = await zip.generateAsync({ type: "arraybuffer" });
    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="lifecoach-export-${ymd(Date.now())}.zip"`,
    );
    return c.body(data);
  });

  return app;
};
