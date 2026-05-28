import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { TabNav } from "~/components/ui/TabNav";
import { Button } from "~/components/ui/Button";
import { Markdown } from "~/components/chat/Markdown";
import { api, type ArtifactRow } from "~/lib/api";
import { toast } from "~/lib/use-toast";
import { useConfirmDiscard } from "~/lib/use-confirm-discard";

/**
 * Edit-sheet for an artifact. Seeded with the current row on open, dirty-
 * guarded on close via window.confirm. Switches body between rendered
 * Markdown preview and raw textarea via the View/Edit TabNav.
 */
export function EditArtifactSheet({
  artifact,
  onClose,
}: {
  artifact: ArtifactRow | null;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [tab, setTab] = useState<"view" | "edit">("view");

  // Seed form state when artifact changes.
  useEffect(() => {
    if (artifact) {
      setTitle(artifact.title);
      setBody(artifact.body);
      setTagsRaw(artifact.tags.join(", "));
      setTab("view");
    }
  }, [artifact]);

  const dirty =
    !!artifact &&
    (title !== artifact.title ||
      body !== artifact.body ||
      tagsRaw !== artifact.tags.join(", "));

  // Guard against losing edits on Escape / overlay-click / X.
  const confirmDiscard = useConfirmDiscard(dirty);
  const requestClose = (): void => {
    if (confirmDiscard()) onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!artifact) throw new Error("No artifact");
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return api.updateArtifact(artifact.id, { title, body, tags });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      toast.success("Artifact saved", title);
      onClose();
    },
    onError: (err: unknown) => {
      toast.error("Save failed", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Sheet
      open={!!artifact}
      onOpenChange={(open) => !open && requestClose()}
      side="right"
      width="w-full md:w-[520px]"
    >
      <SheetHeader
        title="Edit artifact"
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
        <div className="px-4 py-4">
          {save.isError && (
            <div className="rounded-md border border-destructive-500/40 bg-destructive-500/5 px-3 py-2 text-xs text-destructive-300 mb-4">
              {save.error instanceof Error ? save.error.message : "Save failed"}
            </div>
          )}

          <div className="space-y-1.5 mb-4">
            <label htmlFor="artifact-title" className="text-xs uppercase tracking-wide text-fg-faint">
              Title
            </label>
            <input
              id="artifact-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          <div className="space-y-1.5 mb-4">
            <label htmlFor="artifact-tags" className="text-xs uppercase tracking-wide text-fg-faint">
              Tags <span className="normal-case text-fg-faint">(comma-separated)</span>
            </label>
            <input
              id="artifact-tags"
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="e.g. dinner, quick, healthy"
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          <div className="mb-3">
            <TabNav
              tabs={[
                { id: "view" as const, label: "View" },
                { id: "edit" as const, label: "Edit" },
              ]}
              active={tab}
              onChange={setTab}
              variant="pill"
              width="none"
            />
          </div>

          <div>
            {tab === "view" && (
              <div className="min-h-[300px] rounded-md border border-border-subtle bg-surface/50 px-4 py-3 text-sm text-fg overflow-y-auto">
                <Markdown>{body}</Markdown>
              </div>
            )}
            {tab === "edit" && (
              <div className="space-y-1.5">
                <label htmlFor="artifact-body" className="text-xs uppercase tracking-wide text-fg-faint">
                  Body
                </label>
                <textarea
                  id="artifact-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full min-h-[300px] rounded-md border border-border-subtle bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent/40 resize-y transition-colors"
                />
              </div>
            )}
          </div>
        </div>
      </SheetBody>
    </Sheet>
  );
}
