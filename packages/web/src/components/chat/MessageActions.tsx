import { useEffect, useMemo, useState } from "react";
import { Check, Copy, BookmarkPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { detectArtifactTypes, getArtifactDescriptor } from "@lifecoach/schemas";
import { api } from "~/lib/api";
import { useChatState } from "./chat-state";
import { cn } from "~/lib/cn";

interface Props {
  /** Markdown source to copy — for assistant messages this is the raw content,
   *  for user messages it's their text. */
  content: string;
  /** Slight visual offset; mobile shows actions always-visible, desktop on group-hover. */
  align?: "left" | "right";
  /**
   * When present (assistant messages only), enables the "Save <type>" button.
   * The content is inspected via detectArtifactTypes to decide if the button appears.
   */
  artifactSource?: { content: string };
}

/**
 * The row of icon actions under a message. Per visual-design §8.1:
 *   - hidden until group-hover or focus-within on desktop
 *   - always visible on mobile (touch has no hover)
 *   - 44px touch targets via p-2 wrapping
 */
export const MessageActions = ({
  content,
  align = "left",
  artifactSource,
}: Props): JSX.Element => {
  const qc = useQueryClient();
  const { sessionId } = useChatState();

  // ── Copy state ────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
    } catch {
      // Fallback for non-secure contexts: legacy execCommand.
      const ta = document.createElement("textarea");
      ta.value = content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
      } catch {
        // give up silently — most browsers in TLS contexts won't hit this
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  // ── Save artifact state ───────────────────────────────────────────────────
  // "saved" is sticky (it carries a link to the page); transient states clear.
  const [saveState, setSaveState] = useState<"idle" | "saved" | "nothing" | "error">(
    "idle",
  );

  useEffect(() => {
    if (saveState === "nothing" || saveState === "error") {
      const t = setTimeout(() => setSaveState("idle"), 2400);
      return () => clearTimeout(t);
    }
  }, [saveState]);

  const detectedTypes = useMemo(
    () => (artifactSource ? detectArtifactTypes(artifactSource.content) : []),
    [artifactSource],
  );

  const firstType = detectedTypes[0];
  const descriptor = firstType ? getArtifactDescriptor(firstType) : undefined;

  const saveArtifact = useMutation({
    mutationFn: () => {
      if (!artifactSource || !firstType) throw new Error("no artifact");
      return api.saveArtifactFromMessage({
        content: artifactSource.content,
        sessionId,
        type: firstType,
      });
    },
    onSuccess: () => {
      setSaveState("saved");
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // The 422 surfaces as the error text; everything else is a real failure.
      setSaveState(msg.includes("no_artifact_detected") ? "nothing" : "error");
    },
  });

  return (
    <div
      className={cn(
        "flex items-center gap-1 transition-opacity duration-150",
        // hover-reveal on desktop; always-visible on touch (per visual-design §8.1)
        "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
        align === "right" && "justify-end",
      )}
    >
      {/* Copy button */}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy message as markdown"}
        className={cn(
          "flex size-9 items-center justify-center rounded-md transition-colors",
          "text-fg-faint hover:text-fg hover:bg-surface-elevated/60",
        )}
      >
        {copied ? (
          <Check className="size-3.5 text-success-500" strokeWidth={1.75} />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.75} />
        )}
      </button>

      {/* Save artifact button — only when a type is detected.
          Once saved, the control becomes a persistent link to the page so the
          user always has a path to what they just created. */}
      {artifactSource && descriptor && saveState === "saved" ? (
        <Link
          to="/artifacts"
          className={cn(
            "flex items-center gap-1 rounded-md px-2 h-9 text-xs transition-colors",
            "text-success-500 hover:bg-surface-elevated/60",
          )}
        >
          <Check className="size-3.5" strokeWidth={1.75} />
          <span>Saved — view</span>
        </Link>
      ) : (
        artifactSource &&
        descriptor && (
          <button
            type="button"
            onClick={() => saveArtifact.mutate()}
            disabled={saveArtifact.isPending}
            aria-label={`Save ${descriptor.label}`}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 h-9 text-xs transition-colors",
              saveState === "error"
                ? "text-destructive-300"
                : "text-fg-faint hover:text-fg hover:bg-surface-elevated/60",
              saveArtifact.isPending && "opacity-60 cursor-not-allowed",
            )}
          >
            <BookmarkPlus className="size-3.5" strokeWidth={1.75} />
            <span>
              {saveState === "nothing"
                ? "Nothing to save"
                : saveState === "error"
                  ? "Couldn't save"
                  : saveArtifact.isPending
                    ? "Saving…"
                    : `Save ${descriptor.label.toLowerCase()}`}
            </span>
          </button>
        )
      )}
    </div>
  );
};
