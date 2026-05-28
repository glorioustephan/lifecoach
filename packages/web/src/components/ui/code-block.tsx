import { cn } from "@/lib/utils"
import React, { useEffect, useState } from "react"
import type { HighlighterCore } from "shiki/core"

type SupportedLanguage =
  | "bash"
  | "css"
  | "html"
  | "javascript"
  | "json"
  | "markdown"
  | "python"
  | "shellsession"
  | "sql"
  | "tsx"
  | "typescript"

const languageAliases: Record<string, SupportedLanguage | "text"> = {
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  sh: "bash",
  shell: "bash",
  shellscript: "bash",
  ts: "typescript",
}

const supportedLanguages = new Set<SupportedLanguage>([
  "bash",
  "css",
  "html",
  "javascript",
  "json",
  "markdown",
  "python",
  "shellsession",
  "sql",
  "tsx",
  "typescript",
])

const normalizeLanguage = (language: string): SupportedLanguage | "text" => {
  const normalized = language.trim().toLowerCase()
  if (normalized === "" || normalized === "text" || normalized === "plaintext") {
    return "text"
  }
  const alias = languageAliases[normalized]
  if (alias !== undefined) return alias
  return supportedLanguages.has(normalized as SupportedLanguage)
    ? (normalized as SupportedLanguage)
    : "text"
}

let highlighterPromise: Promise<HighlighterCore> | null = null

const loadHighlighter = async (): Promise<HighlighterCore> => {
  highlighterPromise ??= (async () => {
    const [
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      githubDark,
      bash,
      css,
      html,
      javascript,
      json,
      markdown,
      python,
      shellsession,
      sql,
      tsx,
      typescript,
    ] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("shiki/themes/github-dark.mjs"),
      import("shiki/langs/bash.mjs"),
      import("shiki/langs/css.mjs"),
      import("shiki/langs/html.mjs"),
      import("shiki/langs/javascript.mjs"),
      import("shiki/langs/json.mjs"),
      import("shiki/langs/markdown.mjs"),
      import("shiki/langs/python.mjs"),
      import("shiki/langs/shellsession.mjs"),
      import("shiki/langs/sql.mjs"),
      import("shiki/langs/tsx.mjs"),
      import("shiki/langs/typescript.mjs"),
    ])

    return createHighlighterCore({
      themes: [githubDark.default],
      langs: [
        bash.default,
        css.default,
        html.default,
        javascript.default,
        json.default,
        markdown.default,
        python.default,
        shellsession.default,
        sql.default,
        tsx.default,
        typescript.default,
      ],
      engine: createJavaScriptRegexEngine(),
    })
  })()
  return highlighterPromise
}

export type CodeBlockProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <div
      className={cn(
        "not-prose flex w-full flex-col overflow-clip border",
        "border-border bg-card text-card-foreground rounded-xl",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export type CodeBlockCodeProps = {
  code: string
  language?: string
  /** Shiki theme. Defaults to github-dark to match the lifecoach dark-first theme. */
  theme?: string
  className?: string
} & React.HTMLProps<HTMLDivElement>

function CodeBlockCode({
  code,
  language = "tsx",
  theme = "github-dark",
  className,
  ...props
}: CodeBlockCodeProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function highlight() {
      if (!code) {
        setHighlightedHtml("<pre><code></code></pre>")
        return
      }

      try {
        const highlighter = await loadHighlighter()
        const html = highlighter.codeToHtml(code, {
          lang: normalizeLanguage(language),
          theme: theme === "github-dark" ? "github-dark" : "github-dark",
        })
        if (!cancelled) setHighlightedHtml(html)
      } catch {
        if (!cancelled) setHighlightedHtml(null)
      }
    }
    highlight()

    return () => {
      cancelled = true
    }
  }, [code, language, theme])

  const classNames = cn(
    "w-full overflow-x-auto text-[13px] [&>pre]:px-4 [&>pre]:py-4",
    className
  )

  // SSR fallback: render plain code if not hydrated yet
  return highlightedHtml ? (
    <div
      className={classNames}
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      {...props}
    />
  ) : (
    <div className={classNames} {...props}>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export type CodeBlockGroupProps = React.HTMLAttributes<HTMLDivElement>

function CodeBlockGroup({
  children,
  className,
  ...props
}: CodeBlockGroupProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { CodeBlockGroup, CodeBlockCode, CodeBlock }
