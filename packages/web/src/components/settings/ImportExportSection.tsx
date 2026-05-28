import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";

/**
 * Markdown bulk import + export controls (Capacities exports, folders, .md
 * files). Extracted from routes/settings.tsx (Wave 5.4).
 */
export function ImportExportSection(): JSX.Element {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const importMut = useMutation({
    mutationFn: (files: File[]) => api.importMarkdown(files, (p) => setProgress(p)),
    onMutate: () => {
      setProgress({ done: 0, total: 0 });
    },
    onSuccess: (r) => {
      setProgress(null);
      const parts = [`Imported ${r.imported}`, `skipped ${r.skipped} (dupes)`];
      if (r.failed > 0) parts.push(`failed ${r.failed}`);
      const detail = parts.join(" · ") + (r.errors.length > 0 ? ` — ${r.errors[0]}` : "");
      if (r.failed > 0) {
        toast.warning("Import finished with errors", detail);
      } else {
        toast.success("Import complete", detail);
      }
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      setProgress(null);
      toast.error("Import failed", err instanceof Error ? err.message : String(err));
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same files
    if (files.length > 0) importMut.mutate(files);
  };

  const btn =
    "cursor-pointer rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg";

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-medium text-fg">Import / Export</h2>
        <p className="mt-0.5 text-xs text-fg-faint">
          Import a .zip of markdown (e.g. a Capacities export) or a folder of files — each is
          ingested and deduped. Export dumps your documents, conversations, and reflections to a
          markdown zip for backup.
        </p>
      </header>
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(btn, importMut.isPending && "pointer-events-none opacity-50")}>
            {importMut.isPending
              ? progress && progress.total > 0
                ? `importing ${progress.done}/${progress.total}…`
                : "importing…"
              : "Import .zip / files"}
            <input
              type="file"
              accept=".zip,.md,.markdown"
              multiple
              className="hidden"
              onChange={onPick}
              disabled={importMut.isPending}
            />
          </label>
          <label className={cn(btn, importMut.isPending && "pointer-events-none opacity-50")}>
            Import folder
            <input
              type="file"
              multiple
              className="hidden"
              onChange={onPick}
              disabled={importMut.isPending}
              {...({ webkitdirectory: "" } as Record<string, string>)}
            />
          </label>
          <a href={api.exportUrl} download className={btn}>
            Export (.zip)
          </a>
        </div>
        {importMut.isPending && (
          <p className="text-[11px] text-fg-muted">
            {progress && progress.total > 0
              ? `Importing ${progress.done} of ${progress.total} files… keep this tab open.`
              : "Reading upload…"}
          </p>
        )}
      </div>
    </section>
  );
}
