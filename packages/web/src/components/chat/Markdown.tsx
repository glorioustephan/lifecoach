/**
 * Chat Markdown renderer.
 *
 * Adopts prompt-kit's `Markdown` (components/ui/markdown.tsx) as the base,
 * which gives us: GFM, remark-breaks, shiki-highlighted CodeBlock, and memoised
 * per-block rendering for streaming performance.
 *
 * We pass custom component overrides to apply lifecoach semantic tokens and the
 * chat-specific prose style (body text scale, constrained headings, table style).
 * The CodeBlock default is github-dark to match the dark-first theme.
 *
 * Per ui-design-system §1.2 — Decision: Adopt (replace).
 */
import { type Components } from "react-markdown";
import { Markdown as PromptKitMarkdown } from "~/components/ui/markdown";
import { CodeBlock, CodeBlockCode } from "~/components/ui/code-block";

function extractLanguage(className?: string): string {
  if (!className) return "plaintext";
  return className.match(/language-(\w+)/)?.[1] ?? "plaintext";
}

/** Custom react-markdown component overrides for chat prose. */
const chatComponents: Partial<Components> = {
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 text-sm leading-relaxed text-fg">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-fg">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-3 last:mb-0 ml-5 list-disc space-y-1 marker:text-fg-faint">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 last:mb-0 ml-5 list-decimal space-y-1 marker:text-fg-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm leading-relaxed text-fg [&_p]:mb-1 [&_p:last-child]:mb-0">
      {children}
    </li>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  /** Inline code vs fenced code block. Fenced → prompt-kit CodeBlock with shiki. */
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <code className="rounded-sm border border-border-subtle bg-surface-elevated px-1 py-0.5 font-mono text-[12px] text-fg">
          {children}
        </code>
      );
    }

    const language = extractLanguage(className);
    return (
      <CodeBlock className="my-3 last:mb-0">
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    );
  },
  /** Suppress the wrapping pre — CodeBlock renders its own. */
  pre: ({ children }) => <>{children}</>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 last:mb-0 border-l-2 border-border pl-3 italic text-fg-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border-subtle" />,
  // In chat, agents shouldn't open h1; downrank headings one level for visual weight.
  h1: ({ children }) => (
    <h2 className="mb-2 mt-4 first:mt-0 text-base font-semibold text-fg">{children}</h2>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 mt-4 first:mt-0 text-sm font-semibold text-fg">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-1 mt-3 first:mt-0 text-sm font-medium text-fg">{children}</h4>
  ),
  table: ({ children }) => (
    <div className="mb-3 last:mb-0 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border px-2 py-1.5 text-left font-medium text-fg-muted">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border-subtle px-2 py-1.5 text-fg">{children}</td>
  ),
};

export const Markdown = ({ children }: { children: string }): JSX.Element => (
  <PromptKitMarkdown components={chatComponents}>{children}</PromptKitMarkdown>
);
