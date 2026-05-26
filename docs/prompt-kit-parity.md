# prompt-kit Parity Audit

**Date**: 2026-05-25  
**Auditor**: Tailwind UX Engineer agent  
**Scope**: `packages/web` — Vite + React 19 + TanStack Router + Tailwind CSS v4  
**Target**: [ibelick/prompt-kit](https://github.com/ibelick/prompt-kit) — full catalog as of the cloned HEAD

---

## 1. prompt-kit Catalog

All 21 components and all exported hooks shipped by the library. Data sourced from `/scripts/registry-components.ts` and source file inspection.

### Input Components

| Component | Subcomponents / Hooks | File | npm Deps | shadcn Deps | Purpose |
|---|---|---|---|---|---|
| **PromptInput** | `PromptInputTextarea`, `PromptInputActions`, `PromptInputAction`, `usePromptInput` | `prompt-input.tsx` | — | `textarea`, `tooltip` | Composable auto-growing chat input with action slot and loading state |
| **PromptSuggestion** | — | `prompt-suggestion.tsx` | `class-variance-authority`, `lucide-react` | `button` | Clickable prompt chip with optional keyword highlight mode |
| **FileUpload** | `FileUploadTrigger`, `FileUploadContent` | `file-upload.tsx` | — | — | Drag-and-drop file upload with portal-based drag overlay and multi-file support |

### Message and Markdown Components

| Component | Subcomponents / Hooks | File | npm Deps | shadcn Deps | Purpose |
|---|---|---|---|---|---|
| **Message** | `MessageAvatar`, `MessageContent`, `MessageActions`, `MessageAction` | `message.tsx` | `react-markdown`, `remark-gfm`, `shiki`, `marked`, `remark-breaks` | `avatar`, `tooltip` | Chat message with avatar, optional markdown rendering, and icon action row |
| **Markdown** | — | `markdown.tsx` | `react-markdown`, `remark-gfm`, `shiki`, `marked`, `remark-breaks` | — (bundles `code-block`) | GFM markdown renderer with syntax-highlighted code blocks |
| **CodeBlock** | `CodeBlockCode`, `CodeBlockGroup` | `code-block.tsx` | `shiki` | — | Syntax-highlighted code display with copy action and language label |
| **ResponseStream** | `useTextStream` | `response-stream.tsx` | — | — | Client-side text streaming simulation with typewriter and fade modes |
| **Reasoning** | `useReasoningContext` | `reasoning.tsx` | `lucide-react` | — (bundles `markdown`, `response-stream`) | Collapsible AI reasoning / chain-of-thought display with markdown support |

### Display Components

| Component | Subcomponents / Hooks | File | npm Deps | shadcn Deps | Purpose |
|---|---|---|---|---|---|
| **Loader** | `CircularLoader`, `TextDotsLoader`, and 10+ variants | `loader.tsx` | — | `button` | Loading indicator with 12+ visual variants (dots, wave, bars, shimmer, etc.) |
| **Tool** | — | `tool.tsx` | `lucide-react` | `collapsible`, `button` | Collapsible tool-call card showing status, input JSON, and output |
| **Source** | `Source`, `SourceFavicon`, `SourceTitle`, `SourceDescription` | `source.tsx` | — | `hover-card` | Inline source citation badge with hover-card showing URL metadata |
| **Image** | — | `image.tsx` | — | — | Renders AI-generated images from base64 or Uint8Array with alt text |
| **Steps** | `StepsItem`, `StepsContent`, `StepsTrigger` | `steps.tsx` | — | `collapsible` | Collapsible sequential step list for reasoning traces / process logs |
| **ChainOfThought** | `ChainOfThoughtItem`, `ChainOfThoughtContent`, `ChainOfThoughtTrigger` | `chain-of-thought.tsx` | `lucide-react` | `collapsible` | Collapsible chain-of-thought display with step bullets and expandable detail |
| **SystemMessage** | — | `system-message.tsx` | `lucide-react` | `button` | Banner-style contextual message with action, error, and warning variants |
| **FeedbackBar** | — | `feedback-bar.tsx` | `lucide-react` | — | Thumbs-up/thumbs-down feedback row for AI responses |
| **TextShimmer** | — | `text-shimmer.tsx` | — | — | Animated shimmer effect on any text element for loading states |
| **ThinkingBar** | — | `thinking-bar.tsx` | `lucide-react` | `text-shimmer` | Pulsing "Thinking…" status bar with optional stop action |

### Layout Components

| Component | Subcomponents / Hooks | File | npm Deps | shadcn Deps | Purpose |
|---|---|---|---|---|---|
| **ChatContainer** | `ChatContainerRoot`, `ChatContainerContent`, `ChatContainerScrollAnchor`, `useAutoScroll` | `chat-container.tsx` | `use-stick-to-bottom` | — | Smart-scrolling chat list container that sticks to bottom during streaming |
| **ScrollButton** | — | `scroll-button.tsx` | `class-variance-authority`, `lucide-react` | `button` | Floating "scroll to bottom" button that auto-shows/hides based on scroll position |

### Summary

- **Total components**: 21  
- **Total exported hooks**: 4 (`usePromptInput`, `useTextStream`, `useAutoScroll`, `useReasoningContext`)

---

## 2. Current Web Component Inventory

### `packages/web/src/components/chat/`

| File | What it is |
|---|---|
| `ChatView.tsx` | Full chat page: message list, streaming, tool-call display, header, session nav |
| `Composer.tsx` | Auto-growing textarea + attach button + send button |
| `Message.tsx` | User bubble (right-aligned) and assistant message (left-border mark) with streaming cursor |
| `Markdown.tsx` | GFM markdown renderer using `react-markdown` + `remark-gfm` |
| `MessageActions.tsx` | Copy and Save-artifact action row for messages |
| `ToolCallDisclosure.tsx` | Collapsible tool-call card with status, input, output, timing |
| `chat-state.tsx` | `ChatStateProvider`, `useChatState`, `useChatActions` context hooks |
| `agent-state.tsx` | `AgentStateProvider`, `useAgentState`, `useSetAgentState` context hooks |
| `SessionListSheet.tsx` | Slide-in session history sheet |

### `packages/web/src/components/ui/`

| File | What it is |
|---|---|
| `Badge.tsx` | `TypeBadge` and `TagBadge` for artifact type chips |
| `Button.tsx` | Multi-variant button (primary / secondary / destructive / ghost, sm / md / lg) |
| `ConfirmDialog.tsx` | Modal confirm dialog via Radix Dialog |
| `EmptyState.tsx` | Centered empty-state slot with icon, title, body, optional CTA |
| `FilterBar.tsx` | Search input + `FilterChip` row for list views |
| `IconButton.tsx` | Icon-only button (default / destructive / success variants) |
| `PaginationNav.tsx` | "X of Y / Load more" pagination footer |
| `PlaceholderView.tsx` | Full-page placeholder for unbuilt routes |
| `Sheet.tsx` | Radix Dialog-backed side/bottom sheet with `SheetHeader`, `SheetBody` |
| `TabNav.tsx` | Tab navigation bar (underline and pill variants) |
| `ViewHeader.tsx` | Sticky page header with title, subtitle, and actions slot |

### `packages/web/src/components/shell/`

| File | What it is |
|---|---|
| `Shell.tsx` | Root layout: rail nav + outlet + tab bar |
| `RailNav.tsx` | Persistent left rail (md+) with icon nav links |
| `TabBar.tsx` | Fixed bottom tab bar (mobile only) |
| `GlobalStatus.tsx` | Agent state + sync status footer in the rail |
| `nav-items.ts` | Nav item definitions |

### `packages/web/src/components/ingest/`

| File | What it is |
|---|---|
| `DropZone.tsx` | Window-level drag-drop overlay with file type rejection |
| `IngestProvider.tsx` | Context provider for file ingestion state |
| `IngestSheet.tsx` | Sheet UI for reviewing and confirming a file ingest |

### `packages/web/src/components/inbox/`

| File | What it is |
|---|---|
| `BriefingPanel.tsx` | Daily briefing display panel |

### `packages/web/src/lib/`

| File | What it is |
|---|---|
| `cn.ts` | `cn()` via `clsx` + `tailwind-merge` |
| `api.ts` | Typed API client |
| `chat-stream.ts` | SSE streaming client for chat |
| `composer-placeholder.ts` | Date-seeded placeholder text for Composer |
| `greeting.ts` | Greeting message generator |
| `time.ts` | Time formatting utilities |
| `use-profile.ts` | `useProfileName` hook (React Query) |

---

## 3. Gap Matrix

Status legend: **Exists** = functionally equivalent component present | **Partial** = present but missing key features | **Missing** = no equivalent

### Input Components

| prompt-kit | Our equivalent | Status | Divergence notes |
|---|---|---|---|
| `PromptInput` + subcomponents | `Composer.tsx` | **Partial** | Our Composer is monolithic (not composable). Missing: `PromptInputActions` slot pattern, `usePromptInput` context, loading state prop, external controlled value. Has extras we need: file-attach button wired to IngestProvider. |
| `PromptSuggestion` | None | **Missing** | No prompt chip / suggestion component exists. |
| `FileUpload` | `DropZone.tsx` + `IngestProvider.tsx` | **Partial** | DropZone covers window-level drag-drop. Missing: inline `FileUpload` composition pattern (`FileUploadTrigger`, `FileUploadContent`), the portal drag overlay pattern from prompt-kit, multi-file API. Our version is ingestion-specific; prompt-kit's is generic. |

### Message and Markdown Components

| prompt-kit | Our equivalent | Status | Divergence notes |
|---|---|---|---|
| `Message` + subcomponents | `Message.tsx` | **Partial** | Core rendering present. Missing: `MessageAvatar` sub-component, `MessageAction` per-action tooltip pattern, composable sub-component API. Our avatar is a hardcoded Leaf icon; prompt-kit's is a generic avatar primitive. |
| `MessageActions` | `MessageActions.tsx` | **Partial** | Copy action present. Missing: tooltip wrapping per action, generic `MessageAction` slot, thumbs feedback. Our version has app-specific artifact-save logic baked in. |
| `Markdown` | `Markdown.tsx` | **Partial** | GFM rendering and inline code present. Missing: `shiki` syntax highlighting (we use plain `<pre>`), `remark-breaks`, `marked` integration. Code blocks render without color. |
| `CodeBlock` | None (inline in `Markdown.tsx`) | **Missing** | No standalone `CodeBlock` component. Syntax highlighting not implemented. |
| `ResponseStream` + `useTextStream` | None — we stream via SSE mutations in `ChatView` | **Missing** | We handle streaming via direct state appends; no reusable `ResponseStream` component or `useTextStream` hook for client-side animation. |
| `Reasoning` + `useReasoningContext` | None | **Missing** | No collapsible reasoning/thinking display. The agent currently doesn't surface chain-of-thought content. |

### Display Components

| prompt-kit | Our equivalent | Status | Divergence notes |
|---|---|---|---|
| `Loader` (12 variants) | Inline spinner SVG in `Button.tsx` | **Partial** | Button has a basic spinning SVG. No standalone `Loader` component; no typing dots, wave, shimmer variants. `GlobalStatus` uses `animate-pulse` dot. |
| `Tool` | `ToolCallDisclosure.tsx` | **Partial** | Collapsible tool-call disclosure present with status, timing, input/output. Missing: `lucide-react` `CheckCircle`/`XCircle` status icons (we use custom dots), Radix `Collapsible` (we use our own toggle state), generic `ToolPart` type schema. API shape is compatible in intent. |
| `Source` | None | **Missing** | No source-citation component or hover-card display. |
| `Image` | None | **Missing** | No component for rendering base64 / Uint8Array AI-generated images. |
| `Steps` | None | **Missing** | No sequential step list component. |
| `ChainOfThought` | None | **Missing** | No chain-of-thought collapsible component. |
| `SystemMessage` | None | **Missing** | No banner-style contextual message component. |
| `FeedbackBar` | None | **Missing** | No thumbs-up/thumbs-down feedback row. |
| `TextShimmer` | None | **Missing** | No shimmer text animation component. |
| `ThinkingBar` | `GlobalStatus` agent indicator (partial) | **Partial** | `GlobalStatus` shows agent state as a pulse dot + text in the rail. Missing: inline `ThinkingBar` within the chat stream, shimmer text animation, stop action. |

### Layout Components

| prompt-kit | Our equivalent | Status | Divergence notes |
|---|---|---|---|
| `ChatContainer` + `useAutoScroll` | Manual `scrollerRef` + `useEffect` in `ChatView.tsx` | **Partial** | `ChatView` has a `ref` + `scrollTop = scrollHeight` effect. Missing: `use-stick-to-bottom` smart scroll (user-scroll-pauses-autoscroll), composable container/content/anchor API, reusability outside ChatView. |
| `ScrollButton` | None | **Missing** | No floating scroll-to-bottom button. |

### Gap Count Summary

| Status | Count |
|---|---|
| Exists | 0 |
| Partial | 10 |
| Missing | 11 |
| **Total prompt-kit items** | **21** |

> No item is a clean 1:1 match ("Exists" is 0) because prompt-kit components all follow the composable sub-component + context pattern which our hand-rolled components do not.

---

## 4. Compatibility Risks

### Risk 1: `"use client"` directives — HIGH (easy fix)

17 of 21 prompt-kit source files open with `"use client"`. This is a Next.js App Router directive. **Vite ignores it silently** — the string is treated as a no-op expression statement, not an error. However, shadcn's CLI (`npx shadcn@latest add`) will copy the files verbatim including the directive. The directive is harmless in Vite (it's just a string literal) but adds noise. Strip it during adoption if desired; it does not break the build.

### Risk 2: `@/` import alias vs. our `~/` alias — HIGH (requires fix)

Every prompt-kit component imports from `"@/lib/utils"` and `"@/components/ui/*"`. Our project uses `~/` as the src alias (defined in `vite.config.ts` as `~ → ./src`). shadcn's `init` command would configure `@` → `src`. **These must be reconciled.** Options:
- Add a second alias `"@": path.resolve(__dirname, "./src")` in `vite.config.ts` alongside `~`. This is the lowest-disruption path — both work simultaneously.
- Alternatively, run `shadcn init` and let it write `components.json` with `aliases.utils = "@/lib/utils"`, then map `@` in vite config.

### Risk 3: `shadcn init` overwrites the CSS — MEDIUM

`npx shadcn@latest init` will attempt to write CSS variable definitions into the project's CSS entry file (e.g., `src/styles/global.css`). Our project has a bespoke Tailwind v4 `@theme {}` block in `theme.css` with custom semantic tokens (`--color-bg`, `--color-accent`, etc.). shadcn expects the default set (`--background`, `--foreground`, `--primary`, etc.). **Conflict**: prompt-kit's `system-message.tsx` references `dark:text-red-800` and `dark:text-zinc-300` (hardcoded Tailwind colors), not our semantic tokens. Plan: run `shadcn init --no-css` (or the `--skip-preflight` flag) to write only `components.json` and avoid CSS overwrite, then manually map colors.

### Risk 4: Tailwind v4 keyframe registration — MEDIUM

The `loader` and `text-shimmer` components declare custom keyframe animations in `tailwind.config.js` format (via the registry `tailwind.config.theme.keyframes` field). **Tailwind v4 has no `tailwind.config.js`** — animations must be declared in the `@theme {}` CSS block. After installing these components, add their keyframes to `packages/web/src/styles/theme.css` under `@keyframes` and reference them via `--animate-*` custom properties or inline `animation:` CSS.

### Risk 5: Radix UI primitives not yet installed — MEDIUM

prompt-kit requires `@radix-ui/react-avatar`, `@radix-ui/react-tooltip`, `@radix-ui/react-collapsible`, `@radix-ui/react-hover-card`. We currently only have `@radix-ui/react-dialog`. These must be installed before the shadcn add commands run.

### Risk 6: `use-stick-to-bottom` — LOW

`ChatContainer` and `ScrollButton` depend on `use-stick-to-bottom`. This is a small, framework-agnostic package compatible with React 19 and Vite. No concerns.

### Risk 7: `react-jsx-parser` (`JsxPreview`) — LOW (optional)

`react-jsx-parser` is an older package with limited React 19 support tested. `JsxPreview` is the least-needed component for lifecoach. Defer unless AI-generated-UI rendering becomes a requirement.

### Risk 8: `shiki` bundle size — LOW

`shiki` is 2–4 MB. It is tree-shaken when you specify a language subset via `createHighlighter`. Our current `Markdown.tsx` avoids it entirely (plain `<pre>`). Adopting prompt-kit's `CodeBlock` will add it; use dynamic import or lazy loading.

---

## 5. Remediation Plan

### Prerequisites (run once)

#### Step A: Add `@` path alias alongside `~/`

Edit `packages/web/vite.config.ts` to add:

```ts
alias: {
  "~": path.resolve(__dirname, "./src"),
  "@": path.resolve(__dirname, "./src"),   // ← add this line
},
```

Also update `packages/web/tsconfig.json` `paths`:

```json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"],
      "@/*": ["./src/*"]
    }
  }
}
```

#### Step B: Create `@/lib/utils` shim

Create `packages/web/src/lib/utils.ts`:

```ts
export { cn } from "./cn";
```

This satisfies all prompt-kit imports of `"@/lib/utils"` without duplicating the `cn` implementation.

#### Step C: Install missing Radix UI primitives

```bash
cd packages/web
pnpm add @radix-ui/react-avatar @radix-ui/react-tooltip @radix-ui/react-collapsible @radix-ui/react-hover-card
```

#### Step D: Install missing npm deps for the components you want

```bash
# For CodeBlock + Markdown (syntax highlighting)
pnpm add shiki marked remark-breaks

# For ChatContainer + ScrollButton
pnpm add use-stick-to-bottom

# For Loader + PromptSuggestion + ScrollButton
pnpm add class-variance-authority

# For JsxPreview (optional, defer)
# pnpm add react-jsx-parser
```

#### Step E: Run `shadcn init` — carefully

```bash
cd packages/web
npx shadcn@latest init
```

When prompted:
- **Style**: Default (or New York — either works; New York is closer to prompt-kit's aesthetic)
- **Base color**: Neutral
- **CSS variables**: YES — but answer the CSS file path as `src/styles/global.css` and immediately revert any `@layer base` CSS variable block it writes (our `@theme {}` in `theme.css` takes precedence)
- **TypeScript**: YES
- **Components path**: `src/components/ui` (matches our existing structure)
- **Utils path**: `src/lib/utils` (the shim we created in Step B)
- **Import alias**: `@`

This writes `packages/web/components.json`. Do **not** let it overwrite `theme.css`.

After init, inspect and revert any CSS changes to `global.css` that conflict with our `@theme {}` block.

### Component Installation Order

Install in dependency order (leaf components first):

#### Tier 1 — No shadcn deps (install first)

```bash
npx shadcn@latest add "https://prompt-kit.com/c/response-stream.json"
npx shadcn@latest add "https://prompt-kit.com/c/text-shimmer.json"
npx shadcn@latest add "https://prompt-kit.com/c/file-upload.json"
npx shadcn@latest add "https://prompt-kit.com/c/image.json"
npx shadcn@latest add "https://prompt-kit.com/c/chat-container.json"
npx shadcn@latest add "https://prompt-kit.com/c/code-block.json"
```

After `text-shimmer`: register its keyframe in `theme.css`:

```css
@keyframes shimmer {
  0%   { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
}
```

#### Tier 2 — Depends on shadcn button/textarea/tooltip

First install shadcn primitives:

```bash
npx shadcn@latest add button
npx shadcn@latest add textarea
npx shadcn@latest add tooltip
npx shadcn@latest add avatar
```

Then install prompt-kit components:

```bash
npx shadcn@latest add "https://prompt-kit.com/c/prompt-input.json"
npx shadcn@latest add "https://prompt-kit.com/c/scroll-button.json"
npx shadcn@latest add "https://prompt-kit.com/c/prompt-suggestion.json"
npx shadcn@latest add "https://prompt-kit.com/c/loader.json"
npx shadcn@latest add "https://prompt-kit.com/c/feedback-bar.json"
npx shadcn@latest add "https://prompt-kit.com/c/thinking-bar.json"
npx shadcn@latest add "https://prompt-kit.com/c/system-message.json"
npx shadcn@latest add "https://prompt-kit.com/c/message.json"
```

After `loader`: register its keyframes in `theme.css` (typing, loading-dots, wave, blink, bounce-dots, thin-pulse, pulse-dot, shimmer-text, wave-bars, spinner-fade — copy from registry-components.ts `tailwind.config.theme.keyframes`).

#### Tier 3 — Depends on shadcn collapsible/hover-card

```bash
npx shadcn@latest add collapsible
npx shadcn@latest add hover-card
npx shadcn@latest add "https://prompt-kit.com/c/tool.json"
npx shadcn@latest add "https://prompt-kit.com/c/source.json"
npx shadcn@latest add "https://prompt-kit.com/c/steps.json"
npx shadcn@latest add "https://prompt-kit.com/c/chain-of-thought.json"
```

#### Tier 4 — Bundles multiple components

```bash
npx shadcn@latest add "https://prompt-kit.com/c/markdown.json"
npx shadcn@latest add "https://prompt-kit.com/c/reasoning.json"
```

#### Defer (lowest value / highest risk)

```bash
# JsxPreview — react-jsx-parser has uncertain React 19 support; defer
# npx shadcn@latest add "https://prompt-kit.com/c/jsx-preview.json"
```

### Adoption Strategy for Existing Components

The guiding principle is **additive only** — existing components are never deleted. prompt-kit components land in `src/components/ui/` (shadcn's configured path); our chat components stay in `src/components/chat/`.

| Our component | Recommended action | Rationale |
|---|---|---|
| `Composer.tsx` | **Wrap** — keep as-is, compose `PromptInput` inside it | `Composer` has IngestProvider integration and lifecoach-specific placeholder logic. Internally adopt `PromptInputTextarea` + `PromptInputActions` subcomponents over time as refactors. Do not replace yet. |
| `Message.tsx` | **Wrap** — keep shell, adopt `MessageAvatar` + `MessageContent` sub-parts | Our two-mode layout (user bubble vs. assistant border-mark) is intentional product design. Adopt prompt-kit's `MessageAvatar` for the avatar slot and `MessageActions` / `MessageAction` for the action row. |
| `MessageActions.tsx` | **Partial replace** — migrate copy action to use `MessageAction` tooltip pattern | Our save-artifact logic is app-specific; keep it. Use `MessageAction` as the button wrapper for the copy action to get tooltip behavior. |
| `Markdown.tsx` | **Replace** — swap with prompt-kit's `Markdown` (once `CodeBlock` + `shiki` are installed) | Our `Markdown.tsx` lacks syntax highlighting. prompt-kit's is a strict superset. After install, do a search-replace of the import and validate output. |
| `ToolCallDisclosure.tsx` | **Wrap then migrate** — use prompt-kit's `Tool` component for new tool types | Keep `ToolCallDisclosure` for existing chat code; route any new tool types through `Tool`. Migrate `ToolCallDisclosure` to `Tool` in a follow-up once API shapes are reconciled. |
| `DropZone.tsx` | **Keep** — our window-level approach is different from prompt-kit's inline `FileUpload` | `FileUpload` is for inline composer use; `DropZone` is the window-level overlay. Both coexist. |
| `Button.tsx` | **Keep** — do not delete; shadcn's `button` is a parallel primitive | shadcn's `button` uses `cva` variants matching Tailwind's default tokens. Our `Button` uses our semantic tokens. Prompt-kit components will use shadcn's `button`; our UI uses our `Button`. Reconcile color tokens in a separate theming pass. |
| `Sheet.tsx` | **Keep** — our version has lifecycle-matching that shadcn's drawer does not | No change needed. |
| All other `ui/` components | **Keep** | No prompt-kit equivalent. |

### Color Token Reconciliation (Theming Pass)

prompt-kit components reference shadcn default tokens (`--background`, `--foreground`, `--primary`, `--muted-foreground`, etc.) hardcoded in their `className` strings. Our theme uses semantic tokens (`--color-bg`, `--color-fg`, etc.). After component installation, add CSS aliases in `theme.css`:

```css
@theme {
  /* Shadcn ↔ lifecoach token bridge */
  --color-background:        var(--color-bg);
  --color-foreground:        var(--color-fg);
  --color-primary:           var(--color-accent);
  --color-primary-foreground: var(--color-accent-fg);
  --color-muted:             var(--color-surface-elevated);
  --color-muted-foreground:  var(--color-fg-muted);
  --color-border:            var(--color-border);  /* already same name */
  --color-ring:              var(--color-accent);
  --color-card:              var(--color-surface);
  --color-card-foreground:   var(--color-fg);
  --color-popover:           var(--color-surface-elevated);
  --color-popover-foreground: var(--color-fg);
  --color-destructive:       var(--color-destructive-500);
  --color-destructive-foreground: var(--color-bg);
  --color-secondary:         var(--color-surface-elevated);
  --color-secondary-foreground: var(--color-fg-muted);
  --color-accent-color:      var(--color-surface-elevated);
  --color-accent-foreground: var(--color-fg);
}
```

> Note: Tailwind v4 uses `--color-*` for its CSS variable namespace. shadcn's v4 integration uses `--background` etc. without the `color-` prefix. After running `shadcn init` with v4, verify which naming convention it writes and adjust the bridge accordingly.

### Why Scaffolding Was Not Executed

The shadcn CLI (`npx shadcn@latest init` + component adds) was intentionally not run in this worktree for the following concrete reasons:

1. **No network access to `prompt-kit.com`**: The registry endpoint (`https://prompt-kit.com/c/*.json`) is unreachable from this environment. The `npx shadcn@latest add "https://prompt-kit.com/c/..."` commands would fail at fetch time.

2. **`components.json` does not exist**: Without running `shadcn init`, any `add` command would abort with "No components.json found." Running `init` interactively requires a TTY; the non-interactive flags (`--defaults`, `--yes`) would write opinionated CSS that conflicts with our `@theme {}` block and require immediate manual revert — making automated scaffolding net-negative.

3. **Additive-only constraint**: The task requires no deletion of working components. Scaffolding without the ability to validate the build output risks overwriting `global.css` or generating duplicate component files at wrong paths.

4. **The plan is complete and executable manually**: All commands are exact and ordered. A developer can execute the remediation plan step-by-step in under 30 minutes on a machine with network access.

---

## 6. Implementation Checklist

Copy this into a GitHub Issue or Linear ticket:

- [ ] Step A: Add `@` alias to `vite.config.ts` and `tsconfig.json`
- [ ] Step B: Create `src/lib/utils.ts` shim
- [ ] Step C: Install Radix UI primitives (`avatar`, `tooltip`, `collapsible`, `hover-card`)
- [ ] Step D: Install npm deps (`shiki`, `marked`, `remark-breaks`, `use-stick-to-bottom`, `class-variance-authority`)
- [ ] Step E: Run `shadcn init` (accept defaults, revert CSS conflicts)
- [ ] Tier 1: Install `response-stream`, `text-shimmer`, `file-upload`, `image`, `chat-container`, `code-block`
- [ ] Add `text-shimmer` keyframe to `theme.css`
- [ ] Tier 2: Install shadcn primitives (`button`, `textarea`, `tooltip`, `avatar`) then `prompt-input`, `scroll-button`, `prompt-suggestion`, `loader`, `feedback-bar`, `thinking-bar`, `system-message`, `message`
- [ ] Add `loader` keyframes to `theme.css`
- [ ] Tier 3: Install shadcn `collapsible`, `hover-card` then `tool`, `source`, `steps`, `chain-of-thought`
- [ ] Tier 4: Install `markdown`, `reasoning`
- [ ] Theming pass: add shadcn ↔ lifecoach token bridge to `theme.css`
- [ ] Validate build: `pnpm -F @lifecoach/web build` — zero TypeScript errors
- [ ] Wrap `Markdown.tsx` import in chat to use prompt-kit version
- [ ] Migrate `MessageActions` copy button to use `MessageAction` tooltip wrapper
- [ ] Smoke-test chat UI: send message, verify streaming, tool disclosure, markdown rendering

---

## Foundation notes

These notes are authoritative for any agent or human running `npx shadcn add` or generating UI components in `packages/web`.

### Button casing rule — do NOT overwrite Button.tsx

`packages/web/src/components/ui/Button.tsx` exports BOTH the shadcn-standard `buttonVariants` (CVA) and the lifecoach `Button` (forwardRef, shadcn-compatible). This dual export is load-bearing:

- prompt-kit components import `{ Button, buttonVariants }` from `@/components/ui/Button` (uppercase B, case-insensitive on macOS).
- Existing lifecoach app code imports `{ Button }` from the same file using our semantic `primary` variant.
- The file carries a `loading` prop and lifecycle-awareness that the shadcn CLI-generated `button.tsx` does not.

**Rule**: future `npx shadcn add button` runs MUST be run with `--overwrite=false` or the add must be skipped for the button primitive. If shadcn overwrites `Button.tsx` with its default (which removes the lifecoach `primary` variant, `loading` prop, and dual-API comment), all existing app code using `variant="primary"` or `loading` breaks silently. On macOS the case-insensitive filesystem means `button.tsx` and `Button.tsx` are the same file — there is no safe way to have both coexist as separate files.

Action: after any `npx shadcn add` session, verify `Button.tsx` still exports `AppButton`, `buttonVariants`, and has the `loading` prop. If it was overwritten, restore from git with `git checkout HEAD -- packages/web/src/components/ui/Button.tsx`.

### Token bridge location

The shadcn ↔ lifecoach token bridge lives in the `@theme {}` block of `packages/web/src/styles/theme.css`, immediately before the `--animate-*` tokens. It maps `--color-background`, `--color-foreground`, `--color-primary`, `--color-muted`, `--color-muted-foreground`, `--color-card`, `--color-popover`, `--color-secondary`, `--color-destructive`, `--color-input`, `--color-ring`, and `--color-accent-foreground` to lifecoach semantic aliases. Because the bridge points at the semantic aliases (not raw palette values), it automatically tracks both dark (default) and light (`.light` rule) themes with no duplication.

### Accent collision — intentional design decision

`--color-accent` is **not** bridged to a muted surface. It remains the lifecoach brand teal (`--color-accent-500` in dark, `--color-accent-600` in light). This means `hover:bg-accent` in prompt-kit ghost buttons and `PromptSuggestion` chip hovers uses the teal brand color rather than shadcn's intended neutral hover fill. This is acceptable and on-brand. Any component where the teal hover is too saturated must be retoned to `hover:bg-surface-elevated` at adoption time — this is the one sanctioned source edit described in `ui-design-system.md §2.2`.
