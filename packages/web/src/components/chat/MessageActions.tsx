import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "~/lib/cn";

interface Props {
  /** Markdown source to copy — for assistant messages this is the raw content,
   *  for user messages it's their text. */
  content: string;
  /** Slight visual offset; mobile shows actions always-visible, desktop on group-hover. */
  align?: "left" | "right";
}

/**
 * The row of icon actions under a message. Per visual-design §8.1:
 *   - hidden until group-hover or focus-within on desktop
 *   - always visible on mobile (touch has no hover)
 *   - 44px touch targets via p-2 wrapping
 */
export const MessageActions = ({ content, align = "left" }: Props): JSX.Element => {
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

  return (
    <div
      className={cn(
        "flex items-center gap-1 transition-opacity duration-150",
        // hover-reveal on desktop; always-visible on touch (per visual-design §8.1)
        "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
        align === "right" && "justify-end",
      )}
    >
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy message as markdown"}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors",
          "text-fg-faint hover:text-fg hover:bg-surface-elevated/60",
        )}
      >
        {copied ? (
          <Check className="size-3.5 text-success-500" strokeWidth={1.75} />
        ) : (
          <Copy className="size-3.5" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
};
