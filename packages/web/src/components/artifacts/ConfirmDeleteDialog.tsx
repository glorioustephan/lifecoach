import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { api, type ArtifactRow } from "~/lib/api";
import { toast } from "~/lib/use-toast";

/**
 * Confirm-delete dialog for an artifact. Persists via api.deleteArtifact
 * and invalidates the artifacts + status query trees on success. Extracted
 * from routes/artifacts.tsx (Wave 5.4) — the in-route handrolled dialog
 * was already replaced with <ConfirmDialog> in Wave 1.5; this just gives
 * the wrapper its own file.
 */
export function ConfirmDeleteDialog({
  artifact,
  onCancel,
}: {
  artifact: ArtifactRow | null;
  onCancel: () => void;
}): JSX.Element | null {
  const qc = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteArtifact(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      toast.success("Artifact deleted", artifact?.title);
      onCancel();
    },
    onError: (err: unknown) => {
      toast.error("Delete failed", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <ConfirmDialog
      open={!!artifact}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Delete this artifact?"
      body={
        <>
          <span className="font-medium text-fg">"{artifact?.title}"</span> will be
          permanently deleted and cannot be recovered.
        </>
      }
      confirmLabel={deleteMut.isPending ? "Deleting…" : "Delete"}
      onCancel={onCancel}
      onConfirm={() => { if (artifact) deleteMut.mutate(artifact.id); }}
      isPending={deleteMut.isPending}
      variant="destructive"
    />
  );
}
