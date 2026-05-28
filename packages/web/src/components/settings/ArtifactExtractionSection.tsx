import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";
import { formatRelative } from "~/lib/time";
import { toast } from "~/lib/use-toast";

/**
 * Toggle pill + status for the daily artifact-extraction job. Extracted
 * from routes/settings.tsx (Wave 5.4). The job auto-disables after 5
 * empty runs to avoid burning model calls; this surface explains why
 * and lets the user resume.
 */
export function ArtifactExtractionSection(): JSX.Element {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["artifact-settings"],
    queryFn: api.artifactSettings,
  });

  const settings = data?.settings;

  const toggle = useMutation({
    mutationFn: (next: boolean) => api.setArtifactAutoExtract(next),
    onSuccess: (_data, next) => {
      void qc.invalidateQueries({ queryKey: ["artifact-settings"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      toast.success(next ? "Auto-extraction enabled" : "Auto-extraction disabled");
    },
    onError: (err: unknown) => {
      toast.error("Could not update setting", err instanceof Error ? err.message : String(err));
    },
  });

  const enabled = settings?.enabled ?? false;

  return (
    <div className="flex flex-col gap-1 px-4 py-4 md:grid md:grid-cols-[140px_1fr] md:items-start md:gap-4">
      <label htmlFor="artifact-extract-label" className="text-xs text-fg-faint">
        Daily auto-extraction
      </label>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p id="artifact-extract-label" className="text-sm text-fg">
              Daily auto-extraction
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Scans recent conversations each day and saves new recipes &amp; artifacts automatically.
            </p>
            {settings?.autoDisabled && (
              <p className="mt-2 text-[11px] text-warning-200">
                Paused automatically after 5 empty runs. Toggle on to resume.
              </p>
            )}
            {settings?.lastScanAt && (
              <p className="mt-1 font-mono text-[10px] text-fg-faint">
                Last scan: {formatRelative(settings.lastScanAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="artifact-extract-label"
            onClick={() => toggle.mutate(!enabled)}
            disabled={toggle.isPending}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              enabled ? "bg-accent" : "bg-surface-elevated",
              toggle.isPending && "opacity-60 cursor-not-allowed",
            )}
          >
            <span className="sr-only">
              {enabled ? "Disable" : "Enable"} daily auto-extraction
            </span>
            <span
              className={cn(
                "pointer-events-none inline-block size-4 rounded-full bg-bg shadow-sm ring-0 transition-transform",
                enabled ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
