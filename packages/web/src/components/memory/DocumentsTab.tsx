import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { IconButton } from "~/components/ui/IconButton";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { api, type DocumentRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { toast } from "~/lib/use-toast";

const DOCS_PAGE_SIZE = 20;

/**
 * Documents tab of the Memory route — paginated list of ingested documents
 * with a forget action that purges every derived fact, measurement, and
 * embedding. Extracted from routes/memory.tsx (Wave 5.4).
 */
export function DocumentsTab({
  page,
  onPageChange,
}: {
  page: number;
  onPageChange: (p: number) => void;
}): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ documents: DocumentRow[]; total: number }>({
    queryKey: ["memory", "documents", page],
    queryFn: async () => {
      const resp = await fetch(`/api/memory/documents?page=${page}&limit=${DOCS_PAGE_SIZE}`);
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });
  const [pendingForget, setPendingForget] = useState<DocumentRow | null>(null);

  const totalPages = Math.ceil((data?.total ?? 0) / DOCS_PAGE_SIZE);
  const itemsShown = data?.documents.length ?? 0;
  const totalItems = data?.total ?? 0;

  const forgetMut = useMutation({
    mutationFn: (id: string) => api.forgetDocument(id),
    onSuccess: ({ result }) => {
      toast.success(
        "Document forgotten",
        `Removed ${result.factsRemoved} facts, ${result.measurementsRemoved} measurements, ${result.embeddingVectorsRemoved} vectors.`,
      );
      void qc.invalidateQueries({ queryKey: ["memory"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      setPendingForget(null);
    },
    onError: (err: unknown) => {
      toast.error("Could not forget document", err instanceof Error ? err.message : String(err));
      setPendingForget(null);
    },
  });

  if (isLoading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="h-16 animate-pulse rounded-md border border-border-subtle bg-surface/50"
          />
        ))}
      </ul>
    );
  }
  if (!data || totalItems === 0) {
    return (
      <p className="mt-12 text-center text-sm text-fg-muted">
        No documents ingested. Drop files in{" "}
        <code className="rounded-sm bg-surface px-1 font-mono text-xs">data/raw/</code>{" "}
        or use{" "}
        <code className="rounded-sm bg-surface px-1 font-mono text-xs">
          pnpm lifecoach ingest
        </code>
        .
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
        {data.documents.map((d) => (
          <li key={d.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-fg">
                  {d.title ?? "(untitled)"}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                  {formatRelative(d.ingested_at)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-fg-muted">
                {d.source} · {d.mime ?? "unknown"} · {d.body_chars.toLocaleString()} chars
              </p>
              <p className="mt-1 truncate font-mono text-[10px] text-fg-faint">{d.id}</p>
            </div>
            <IconButton
              variant="default"
              size="sm"
              onClick={() => setPendingForget(d)}
              aria-label={`Forget ${d.title ?? d.id}`}
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <PaginationNav
          currentPage={page}
          totalPages={totalPages}
          itemsShown={itemsShown}
          totalItems={totalItems}
          onLoadMore={() => onPageChange(page + 1)}
          isLoading={isLoading}
        />
      </div>
      <ConfirmDialog
        open={!!pendingForget}
        onOpenChange={(open) => { if (!open) setPendingForget(null); }}
        title="Forget this document?"
        body={
          <>
            This removes{" "}
            <span className="font-medium text-fg">
              {pendingForget?.title ?? "(untitled)"}
            </span>{" "}
            and every fact, measurement, and embedding the coach derived from it.
            The source file (if still on disk) is untouched.
          </>
        }
        confirmLabel={forgetMut.isPending ? "Forgetting…" : "Forget"}
        onCancel={() => setPendingForget(null)}
        onConfirm={() => { if (pendingForget) forgetMut.mutate(pendingForget.id); }}
        isPending={forgetMut.isPending}
        variant="destructive"
      />
    </>
  );
}
