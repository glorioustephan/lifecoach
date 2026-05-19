import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Tailwind-styled markdown renderer for assistant messages.
 *
 * Scoped to chat output — paragraphs, lists, code, tables, links, blockquotes.
 * Intentionally small surface; we don't render h1/h2 in chat (the agent
 * shouldn't be opening level-1 headings inside a conversation bubble).
 */
const components: Components = {
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
  code: ({ className, children }) => {
    // Inline code (no language class) vs block code (has language class).
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className={`${className ?? ""} font-mono text-xs`}>{children}</code>
      );
    }
    return (
      <code className="rounded-sm border border-border-subtle bg-surface-elevated px-1 py-0.5 font-mono text-[12px] text-fg">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 last:mb-0 overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-fg">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 last:mb-0 border-l-2 border-border pl-3 italic text-fg-muted">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border-subtle" />,
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
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
    {children}
  </ReactMarkdown>
);
