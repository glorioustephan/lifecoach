/**
 * MessageActions — copy + save-artifact / create-items row for chat messages.
 *
 * Wraps prompt-kit's `MessageAction` sub-component (from components/ui/message.tsx)
 * for the per-button tooltip pattern. All app-specific logic (copy fallback,
 * artifact declaration, actionable-items proposal, React Query mutation, artifact
 * link) is here.
 *
 * Per ui-design-system §1.2 — Decision: Wrap (MessageActions).
 *
 * ## Button rendering logic (ADHD-10: predictable interaction surfaces)
 *
 * Three tiers, evaluated top-down:
 *
 * 1. toolUse.name === "propose_artifact"
 *    → Full-weight "Save <descriptor.label>" button. Explicit agent declaration
 *      wins unconditionally. Legacy heuristic is NOT consulted.
 *
 * 2. toolUse.name === "propose_actionable_items"
 *    → Full-weight "Create N items" button → opens ProposalReviewModal.
 *
 * 3. toolUse absent OR unknown tool
 *    → Heuristic fallback (detectArtifactTypes). Rendered as a lower-weight
 *      outlined "Maybe save?" button. Kept for legacy messages (pre-propose tool
 *      era). Deprecation plan: remove when telemetry shows ≥95% of artifact
 *      messages arrive via propose_artifact.
 *
 * The heuristic code path in packages/schemas/src/artifact.ts:77-108 is
 * intentionally unchanged — this file merely controls when it renders.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, BookmarkPlus, ListPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { detectArtifactTypes, getArtifactDescriptor } from "@lifecoach/schemas";
import { api } from "~/lib/api";
import { useChatState } from "./chat-state";
import { cn } from "~/lib/cn";
import { MessageAction } from "~/components/ui/message";
import type { ToolUseCapture } from "~/lib/chat-stream";
import { ProposalReviewModal } from "~/components/habits/ProposalReviewModal";

interface Props {
  /** Markdown source to copy — for assistant messages this is the raw content,
   *  for user messages it's their text. */
  content: string;
  /** Slight visual offset; mobile shows actions always-visible, desktop on group-hover. */
  align?: "left" | "right";
  /**
   * When present (assistant messages only), enables the save-artifact / create-items
   * button. The toolUse field takes priority over the heuristic.
   */
  artifactSource?: { content: string };
  /**
   * When present, the agent explicitly declared its intent via propose_artifact
   * or propose_actionable_items. Presence of this field disables the heuristic.
   * See the tier documentation at the top of this file.
   */
  toolUse?: ToolUseCapture;
}

/**
 * The row of icon actions under a message. Per visual-design §8.1:
 *   - hidden until group-hover or focus-within on desktop
 *   - always visible on mobile (touch has no hover)
 *   - 44px touch targets via p-2 wrapping
 *
 * Uses prompt-kit `MessageAction` for tooltip wrapping on each button.
 */
export const MessageActions = ({
  content,
  align = "left",
  artifactSource,
  toolUse,
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
  const [saveState, setSaveState] = useState<"idle" | "saved" | "nothing" | "error">("idle");

  useEffect(() => {
    if (saveState === "nothing" || saveState === "error") {
      const t = setTimeout(() => setSaveState("idle"), 2400);
      return () => clearTimeout(t);
    }
  }, [saveState]);

  // ── ProposalReviewModal state ─────────────────────────────────────────────
  const [proposalOpen, setProposalOpen] = useState(false);

  // ── Determine which tier applies ──────────────────────────────────────────
  //
  // ADHD-10: predictable interaction surfaces — the same visual weight always
  // means the same confidence level. Full-weight = explicit agent declaration;
  // outlined/faint = heuristic fallback.
  const proposeArtifactType =
    toolUse?.name === "propose_artifact"
      ? (toolUse.input as { type?: string } | undefined)?.type
      : undefined;

  const proposeDescriptor = proposeArtifactType
    ? getArtifactDescriptor(proposeArtifactType)
    : undefined;

  // Tier 2: explicit propose_actionable_items
  const isProposalItems = toolUse?.name === "propose_actionable_items";
  const proposalItems = isProposalItems
    ? ((toolUse?.input as { items?: unknown[] } | undefined)?.items ?? [])
    : [];
  const proposalGoalSuggestion = isProposalItems
    ? (toolUse?.input as {
        parentGoalSuggestion?: { title: string; kind: "outcome" | "process" | "identity"; rationale?: string };
      } | undefined)?.parentGoalSuggestion
    : undefined;

  // Tier 3: heuristic fallback — only when toolUse is absent or unknown.
  // When the agent has declared intent, we never consult the heuristic.
  const heuristicEnabled = !toolUse;
  const detectedTypes = useMemo(
    () =>
      heuristicEnabled && artifactSource ? detectArtifactTypes(artifactSource.content) : [],
    [heuristicEnabled, artifactSource],
  );
  const heuristicFirstType = detectedTypes[0];
  const heuristicDescriptor = heuristicFirstType
    ? getArtifactDescriptor(heuristicFirstType)
    : undefined;

  const saveArtifact = useMutation({
    mutationFn: () => {
      const type = proposeArtifactType ?? heuristicFirstType;
      if (!artifactSource || !type) throw new Error("no artifact");
      return api.saveArtifactFromMessage({
        content: artifactSource.content,
        ...(sessionId !== undefined ? { sessionId } : {}),
        type,
      });
    },
    onSuccess: () => {
      setSaveState("saved");
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveState(msg.includes("no_artifact_detected") ? "nothing" : "error");
    },
  });

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 transition-opacity duration-150",
          // hover-reveal on desktop; always-visible on touch (per visual-design §8.1)
          "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
          align === "right" && "justify-end",
        )}
      >
        {/* Copy button — wrapped with prompt-kit MessageAction for tooltip */}
        <MessageAction
          tooltip={copied ? "Copied" : "Copy message as markdown"}
          side="top"
        >
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
        </MessageAction>

        {/*
         * Tier 1 — explicit propose_artifact declaration.
         * Full visual weight (no outline-only styling). Once saved, becomes a
         * persistent link to the artifacts page (ADHD-6: quick reversal via View).
         */}
        {proposeDescriptor && saveState === "saved" ? (
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
        ) : proposeDescriptor ? (
          <MessageAction tooltip={`Save ${proposeDescriptor.label}`} side="top">
            <button
              type="button"
              onClick={() => saveArtifact.mutate()}
              disabled={saveArtifact.isPending}
              aria-label={`Save ${proposeDescriptor.label}`}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 h-9 text-xs transition-colors",
                saveState === "error"
                  ? "text-destructive-300"
                  : "text-fg-muted hover:text-fg hover:bg-surface-elevated/60",
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
                      : `Save ${proposeDescriptor.label.toLowerCase()}`}
              </span>
            </button>
          </MessageAction>

        /*
         * Tier 2 — explicit propose_actionable_items declaration.
         * Full visual weight. Opens ProposalReviewModal on click.
         * N in the label updates as the user unchecks items inside the modal
         * (the label here just shows the initial count from the agent).
         */
        ) : isProposalItems ? (
          <MessageAction
            tooltip={`Review and create ${proposalItems.length} recommended action${proposalItems.length !== 1 ? "s" : ""}`}
            side="top"
          >
            <button
              type="button"
              onClick={() => setProposalOpen(true)}
              aria-label={`Create ${proposalItems.length} items`}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 h-9 text-xs transition-colors",
                "text-fg-muted hover:text-fg hover:bg-surface-elevated/60",
              )}
            >
              <ListPlus className="size-3.5" strokeWidth={1.75} />
              <span>Create {proposalItems.length} item{proposalItems.length !== 1 ? "s" : ""}</span>
            </button>
          </MessageAction>

        /*
         * Tier 3 — heuristic fallback.
         * Lower visual weight (text-fg-faint, outline style) to signal lower
         * confidence. Only visible when the agent did NOT call a propose tool.
         * Deprecation target: remove when ≥95% of artifact messages arrive via
         * propose_artifact (ADHD-10: predictable interaction surfaces).
         */
        ) : heuristicDescriptor && artifactSource ? (
          saveState === "saved" ? (
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
            <MessageAction tooltip="Maybe save?" side="top">
              <button
                type="button"
                onClick={() => saveArtifact.mutate()}
                disabled={saveArtifact.isPending}
                aria-label="Maybe save?"
                className={cn(
                  "flex items-center gap-1 rounded-md border border-border px-2 h-9 text-xs transition-colors",
                  saveState === "error"
                    ? "text-destructive-300 border-destructive-300/50"
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
                        : "Maybe save?"}
                </span>
              </button>
            </MessageAction>
          )
        ) : null}
      </div>

      {/* ProposalReviewModal — rendered outside the action row so it can portal
          to document body without clipping concerns (ADHD-2: progressive disclosure). */}
      {isProposalItems && (
        <ProposalReviewModal
          open={proposalOpen}
          onClose={() => setProposalOpen(false)}
          candidates={proposalItems as Parameters<typeof ProposalReviewModal>[0]["candidates"]}
          parentGoalSuggestion={proposalGoalSuggestion}
          sessionId={sessionId ?? undefined}
        />
      )}
    </>
  );
};
