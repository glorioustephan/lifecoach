import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { factCategory } from "@lifecoach/schemas";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { Button } from "~/components/ui/Button";
import { IconButton } from "~/components/ui/IconButton";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { api, type FactRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { toast } from "~/lib/use-toast";
import { useConfirmDiscard } from "~/lib/use-confirm-discard";

const FACTS_PAGE_SIZE = 50;
const FACT_CATEGORIES = factCategory.options;

/**
 * Facts tab of the Memory route — paginated list with edit/forget per row.
 * Extracted from routes/memory.tsx (Wave 5.4) so the route stays a thin
 * shell over three tab components.
 */
export function FactsTab({
  page,
  onPageChange,
}: {
  page: number;
  onPageChange: (p: number) => void;
}): JSX.Element {
  const { data, isLoading } = useQuery<{ facts: FactRow[]; total: number }>({
    queryKey: ["memory", "facts", page],
    queryFn: async () => {
      const resp = await fetch(`/api/memory/facts?page=${page}&limit=${FACTS_PAGE_SIZE}`);
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  const [editingFact, setEditingFact] = useState<FactRow | null>(null);
  const [deletingFact, setDeletingFact] = useState<FactRow | null>(null);

  const totalPages = Math.ceil((data?.total ?? 0) / FACTS_PAGE_SIZE);
  const itemsShown = data?.facts.length ?? 0;
  const totalItems = data?.total ?? 0;

  if (isLoading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-14 animate-pulse rounded-md border border-border-subtle bg-surface/50"
          />
        ))}
      </ul>
    );
  }
  if (!data || totalItems === 0) {
    return (
      <p className="mt-12 text-center text-sm text-fg-muted">
        No facts stored yet. Chat with your coach — facts will land here as you
        share things about yourself.
      </p>
    );
  }
  return (
    <>
      <ul className="space-y-2">
        {data.facts.map((f) => (
          <FactCard
            key={f.id}
            fact={f}
            onEdit={() => setEditingFact(f)}
            onDelete={() => setDeletingFact(f)}
          />
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
      <EditFactSheet fact={editingFact} onClose={() => setEditingFact(null)} />
      <ConfirmForgetFactDialog
        fact={deletingFact}
        onCancel={() => setDeletingFact(null)}
      />
    </>
  );
}

function FactCard({
  fact,
  onEdit,
  onDelete,
}: {
  fact: FactRow;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <li className="group/fact rounded-md border border-border bg-surface px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-fg">{fact.subject}</span>
        <span className="shrink-0 rounded-sm border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] text-fg-faint">
          {fact.category}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-xs text-fg-muted">{fact.body}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[10px] text-fg-faint" title={fact.id}>
          {fact.id}
        </span>
        <div className="flex shrink-0 items-center gap-1 md:opacity-0 md:group-hover/fact:opacity-100 md:focus-within:opacity-100 transition-opacity duration-150">
          <IconButton
            variant="default"
            size="sm"
            aria-label="Edit fact"
            title="Edit"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" strokeWidth={1.75} />
          </IconButton>
          <IconButton
            variant="destructive"
            size="sm"
            aria-label="Forget fact"
            title="Forget"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

function EditFactSheet({
  fact,
  onClose,
}: {
  fact: FactRow | null;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("other");

  useEffect(() => {
    if (fact) {
      setSubject(fact.subject);
      setBody(fact.body);
      setCategory(fact.category);
    }
  }, [fact]);

  const dirty =
    !!fact &&
    (subject !== fact.subject || body !== fact.body || category !== fact.category);

  const confirmDiscard = useConfirmDiscard(dirty);
  const requestClose = (): void => {
    if (confirmDiscard()) onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!fact) throw new Error("No fact");
      return api.updateFact(fact.id, { subject, body, category });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memory", "facts"] });
      toast.success("Memory updated", subject);
      onClose();
    },
    onError: (err: unknown) => {
      toast.error("Save failed", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Sheet
      open={!!fact}
      onOpenChange={(open) => !open && requestClose()}
      side="right"
      width="w-full md:w-[480px]"
    >
      <SheetHeader
        title="Edit memory"
        onClose={requestClose}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || !dirty}
            loading={save.isPending}
          >
            {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        }
      />
      <SheetBody>
        {fact && (
          <div className="px-4 py-4">
            {save.isError && (
              <div className="mb-4 rounded-md border border-destructive-500/40 bg-destructive-500/5 px-3 py-2 text-xs text-destructive-300">
                {save.error instanceof Error ? save.error.message : "Save failed"}
              </div>
            )}

            <div className="mb-4 space-y-1.5">
              <label
                htmlFor="fact-subject"
                className="text-xs uppercase tracking-wide text-fg-faint"
              >
                Subject
              </label>
              <input
                id="fact-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-accent/40 transition-colors"
              />
            </div>

            <div className="mb-4 space-y-1.5">
              <label
                htmlFor="fact-category"
                className="text-xs uppercase tracking-wide text-fg-faint"
              >
                Category
              </label>
              <select
                id="fact-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent/40 transition-colors"
              >
                {FACT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 space-y-1.5">
              <label
                htmlFor="fact-body"
                className="text-xs uppercase tracking-wide text-fg-faint"
              >
                Body
              </label>
              <textarea
                id="fact-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full min-h-[200px] resize-y rounded-md border border-border-subtle bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent/40 transition-colors"
              />
            </div>

            <p className="font-mono text-[10px] text-fg-faint">id: {fact.id}</p>
            <p className="mt-1 text-[10px] text-fg-faint">
              created {formatRelative(fact.createdAt)}
            </p>
          </div>
        )}
      </SheetBody>
    </Sheet>
  );
}

function ConfirmForgetFactDialog({
  fact,
  onCancel,
}: {
  fact: FactRow | null;
  onCancel: () => void;
}): JSX.Element | null {
  const qc = useQueryClient();
  const forget = useMutation({
    mutationFn: (id: string) => api.forgetFact(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["memory", "facts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      toast.success("Memory forgotten", fact?.subject);
      onCancel();
    },
    onError: (err: unknown) => {
      toast.error("Could not forget memory", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <ConfirmDialog
      open={!!fact}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Forget this memory?"
      body={
        <>
          <span className="font-medium text-fg">"{fact?.subject}"</span> will be
          soft-deleted and removed from semantic recall. The row stays in the
          database so it can be restored later if needed.
        </>
      }
      confirmLabel={forget.isPending ? "Forgetting…" : "Forget"}
      onCancel={onCancel}
      onConfirm={() => { if (fact) forget.mutate(fact.id); }}
      isPending={forget.isPending}
      variant="destructive"
    />
  );
}
