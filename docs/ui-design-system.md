# Lifecoach UI Design System

**Status**: Canonical. Single source of truth.
**Base component layer**: [ibelick/prompt-kit](https://github.com/ibelick/prompt-kit) (shadcn registry).
**Scope**: `packages/web` — Vite + React 19 + TanStack Router + Tailwind CSS v4.
**Audience**: human contributors, component-build agents, and the `CLAUDE.md` / UI-generation skill.

> **Read me first.** Any agent or human generating or editing UI in `packages/web` MUST follow this document. It supersedes ad-hoc patterns currently in the tree. When this document and existing code disagree, this document wins and the code is the thing to fix.
>
> Companion docs: `docs/prompt-kit-parity.md` (the gap matrix + install commands), `docs/visual-design.md` (color/type/spacing rationale), `docs/ux-spec.md` (IA + flows). This doc governs **structure, behavior, composition, and which component to use** — it does not redefine visual tokens, it points at the ones that already exist in `theme.css`.

---

## 0. The four rules (non-negotiable)

These are the guardrails. If you remember nothing else:

1. **prompt-kit is the base layer.** For any chat/agent/AI surface (messages, composer, tool calls, reasoning, streaming, sources, loaders), reach for a prompt-kit component first. Do not hand-roll a new chat primitive when prompt-kit ships one. See the catalog in §1.
2. **Reference semantic theme tokens, never raw Tailwind palette.** Use `bg-surface`, `text-fg-muted`, `border-border`, `text-accent` — never `bg-zinc-800`, `text-gray-400`, `dark:text-red-800`. Raw palette values break dark/light parity. See §2.
3. **Wrap, don't fork.** When a prompt-kit component is close but needs lifecoach behavior, wrap it in a thin lifecoach component in `components/chat/` (or the relevant feature dir). Do not copy its source and diverge. The "Adopt / Wrap / Build" decision for every component is in §1.
4. **Compose with sub-components + context, the prompt-kit way.** New composite UI follows the `Root` / `Trigger` / `Content` + context-hook pattern (§3). No monolithic 200-line components with everything inline.

---

## 1. Component catalog

Every prompt-kit component and hook, its purpose, the lifecoach surface(s) it maps to, and the **Adopt / Wrap / Build** decision.

**Decision legend:**
- **Adopt** — use the prompt-kit component directly; no lifecoach wrapper needed (import from `components/ui/`).
- **Wrap** — use prompt-kit as the internal engine, but expose a thin lifecoach component that owns app-specific props/behavior (placeholder logic, IngestProvider, artifact-save, agent-state). Wrapper lives in the feature dir.
- **Build** — no prompt-kit equivalent or the prompt-kit one is unsuitable; build a lifecoach component following §3 conventions.

### 1.1 Input components

| prompt-kit | Sub-components / hook | Lifecoach surface | Decision | Rationale |
|---|---|---|---|---|
| **PromptInput** | `PromptInputTextarea`, `PromptInputActions`, `PromptInputAction`, `usePromptInput` | chat **Composer** (`components/chat/Composer.tsx`) | **Wrap** | Composer owns IngestProvider attach wiring + date-seeded placeholder + agent-aware disabled state. Adopt the composable internals (`PromptInputTextarea`, `PromptInputActions`, `usePromptInput`) so value/loading is controlled by prompt-kit; keep the wrapper for lifecoach concerns. |
| **PromptSuggestion** | — | empty-chat starter chips; inbox "ask about this" chips | **Adopt** | No equivalent exists. Drop directly into the empty-chat state and inbox cards. Style via semantic tokens (it uses shadcn `button` → bridged in §2). |
| **FileUpload** | `FileUploadTrigger`, `FileUploadContent` | inline composer attach **only** (not window-level) | **Build** (defer) — keep `DropZone` | `DropZone` (window-level overlay) + `IngestProvider` is a deliberately different model and stays. prompt-kit's inline `FileUpload` is only worth adopting if/when we want an in-composer drag target; until then, do not introduce it. |

### 1.2 Message & markdown components

| prompt-kit | Sub-components / hook | Lifecoach surface | Decision | Rationale |
|---|---|---|---|---|
| **Message** | `MessageAvatar`, `MessageContent`, `MessageActions`, `MessageAction` | chat **Message** (`components/chat/Message.tsx`) | **Wrap** | The two-mode layout (user bubble vs. assistant left-border voice-mark with Leaf avatar on run-start) is intentional product identity (visual-design §8.1). Keep the wrapper; adopt `MessageAvatar` for the avatar slot, `MessageContent`, and `MessageAction` for tooltip-wrapped action buttons. |
| **MessageActions** | `MessageAction` | chat **MessageActions** (`components/chat/MessageActions.tsx`) | **Wrap** | Copy + Save-artifact logic is app-specific (artifact detection, React Query mutation, hover-reveal). Adopt `MessageAction` as the per-button tooltip wrapper; keep our handlers and the artifact descriptor logic. |
| **Markdown** | — | chat **Markdown** (`components/chat/Markdown.tsx`) | **Adopt** (replace ours) | Our `Markdown.tsx` renders plain `<pre>` with no syntax highlighting. prompt-kit's is a strict superset (GFM + `remark-breaks` + shiki via bundled CodeBlock). Swap the import; validate output renders agent lists/bold/code. |
| **CodeBlock** | `CodeBlockCode`, `CodeBlockGroup` | code inside chat messages; tool-call output blocks | **Adopt** | We have no standalone CodeBlock. Comes bundled with Markdown. Use it directly for any code display. Lazy-load shiki (parity Risk 8). |
| **ResponseStream** | `useTextStream` | optional typewriter polish on assistant text | **Build** (defer) | We already stream via SSE state appends in `ChatView` (real token deltas). `useTextStream` is client-side *simulation* — only adopt if we want fade/typewriter animation on already-complete text. Not needed for live streaming. |
| **Reasoning** | `useReasoningContext` | **agent thinking / chain-of-thought** disclosure in the chat stream | **Adopt** | No equivalent. When the agent surfaces reasoning content, render it in a collapsible `Reasoning` block above the answer. High value for "proof of work" identity (visual-design §11.4). |

### 1.3 Display components

| prompt-kit | Sub-components | Lifecoach surface | Decision | Rationale |
|---|---|---|---|---|
| **Loader** (12 variants) | `CircularLoader`, `TextDotsLoader`, … | replace inline spinner SVG in `Button`; list-loading states across routes | **Adopt** | We have only a hand-rolled spinner inside `Button`. Adopt `Loader` as the single loading primitive; use `TextDotsLoader` for "agent is typing" and `CircularLoader` for button/inline. Register keyframes in `theme.css` (parity Risk 4). |
| **Tool** | — | chat **ToolCallDisclosure** (`components/chat/ToolCallDisclosure.tsx`) | **Wrap** then migrate | Our `ToolCallDisclosure` already matches in intent (status dot, timing, in/out, Radix-free toggle). Adopt prompt-kit `Tool` (Radix Collapsible + lucide status icons) as the engine; keep our `ToolCallState` shape mapping in the wrapper. Migrate existing chat code to the wrapper, don't break it. |
| **Source** | `SourceFavicon`, `SourceTitle`, `SourceDescription` | inline citation badges in assistant messages; sources route | **Adopt** | No equivalent. Use for any URL/source the agent cites. Hover-card metadata is exactly the "where did this come from" affordance the app wants. |
| **Image** | — | agent-generated / attached images in chat | **Adopt** | No equivalent. Use directly when a message carries base64/Uint8Array image content. Low frequency but zero-cost to adopt. |
| **Steps** | `StepsItem`, `StepsContent`, `StepsTrigger` | multi-step sync/ingest progress; agent process logs | **Adopt** | No equivalent. Use for sequential process traces (e.g. Todoist sync stages, ingest pipeline steps) where `ChainOfThought` is too reasoning-flavored. |
| **ChainOfThought** | `ChainOfThoughtItem`, `ChainOfThoughtContent`, `ChainOfThoughtTrigger` | agent thinking trace in chat (sibling to `Reasoning`) | **Adopt** | No equivalent. `ChainOfThought` for bulleted step traces; `Reasoning` for free-form markdown reasoning. Pick one per surface — do not stack both. |
| **SystemMessage** | — | inline chat banners (rate-limit, connector-down, warning); route-level notices | **Adopt** | No equivalent — but **must** be retoned to semantic tokens: its source hardcodes `dark:text-red-800` / `dark:text-zinc-300` (parity Risk 3). On adoption, replace those with `text-destructive-300` / `text-fg-muted`. Use for the `[error: …]` states currently inlined as raw text in `ChatView`. |
| **FeedbackBar** | — | thumbs up/down under assistant answers | **Adopt** (when feedback backend exists) | No equivalent. Adopt the component now for layout; wire to a feedback endpoint when one ships. Sits in the `MessageActions` row. |
| **TextShimmer** | — | skeleton/loading text; "Thinking…" label | **Adopt** | No equivalent. The shimmer primitive behind `ThinkingBar`. Register `shimmer` keyframe in `theme.css`. |
| **ThinkingBar** | — | inline "agent is thinking" bar in the chat stream + stop action | **Wrap** | We surface agent state as a pulse dot in `GlobalStatus` (rail footer). Adopt `ThinkingBar` for the **in-stream** thinking indicator; wrap it to bind to `agent-state` context and the SSE abort/stop control. Keep `GlobalStatus` for the ambient rail glow. |

### 1.4 Layout components

| prompt-kit | Sub-components / hook | Lifecoach surface | Decision | Rationale |
|---|---|---|---|---|
| **ChatContainer** | `ChatContainerRoot`, `ChatContainerContent`, `ChatContainerScrollAnchor`, `useAutoScroll` | **ChatView** scroller (`components/chat/ChatView.tsx`) | **Wrap** | Current scroll is a naive `scrollTop = scrollHeight` effect that fights the user during streaming. Adopt `ChatContainerRoot/Content/ScrollAnchor` + `use-stick-to-bottom` so user-scroll pauses autoscroll. Keep ChatView as the orchestrator; swap its scroller internals. |
| **ScrollButton** | — | floating "jump to latest" button in ChatView | **Adopt** | No equivalent. Pairs with `ChatContainer`. Drop in directly, tone to `bg-surface-elevated`/`text-fg-muted`. |

### 1.5 Hooks

| Hook | From | Lifecoach use | Decision |
|---|---|---|---|
| `usePromptInput` | PromptInput | controlled value/loading inside Composer wrapper | **Adopt** |
| `useAutoScroll` | ChatContainer | stick-to-bottom in ChatView wrapper | **Adopt** |
| `useReasoningContext` | Reasoning | reasoning open/close state | **Adopt** (used internally by `Reasoning`) |
| `useTextStream` | ResponseStream | client-side text animation | **Defer** — we stream real deltas |

### 1.6 Catalog at a glance

- **Adopt (10)**: PromptSuggestion, Markdown, CodeBlock, Reasoning, Loader, Source, Image, Steps, ChainOfThought, SystemMessage, FeedbackBar, TextShimmer, ScrollButton.
- **Wrap (6)**: PromptInput→Composer, Message, MessageActions, Tool→ToolCallDisclosure, ThinkingBar, ChatContainer→ChatView.
- **Build / Defer (3)**: FileUpload (keep DropZone), ResponseStream (real SSE), JsxPreview (out of scope — parity Risk 7).

---

## 2. Design tokens & conventions

> **The rule.** Generated components MUST reference the **semantic** tokens below. They must NOT use raw Tailwind palette utilities (`bg-zinc-*`, `text-gray-*`, `text-red-*`, `dark:*` color overrides). Dark/light parity is achieved *only* because every surface points at a semantic alias that is re-pointed under `.light` in `theme.css`. A raw palette value silently breaks light mode.

These values are **extracted from `packages/web/src/styles/theme.css`** — do not invent new ones. To add a token, add it to `theme.css` first, then reference it.

### 2.1 Color — semantic aliases (use these)

| Token (Tailwind class) | CSS var | Role |
|---|---|---|
| `bg-bg` / `text-bg` | `--color-bg` | App background (page) |
| `bg-surface` | `--color-surface` | Card / panel / composer field surface |
| `bg-surface-elevated` | `--color-surface-elevated` | Hover fills, popovers, dropdowns, user-bubble bg |
| `border-border` | `--color-border` | Card borders, dividers, sheet header rule |
| `border-border-subtle` | `--color-border-subtle` | Row dividers, secondary-button border, composer top rule |
| `text-fg` | `--color-fg` | Primary text |
| `text-fg-muted` | `--color-fg-muted` | Secondary text, labels, icon default |
| `text-fg-faint` | `--color-fg-faint` | Tertiary text, placeholders, metadata, mono labels |
| `bg-accent` / `text-accent` / `text-accent-fg` | `--color-accent` / `--color-accent-fg` | Primary action, active state, voice-mark, focus ring |
| `*-success-500` / `-200` | `--color-success-*` | Success/positive status |
| `*-warning-500` / `-200` | `--color-warning-*` | Warnings |
| `*-destructive-500` / `-300` / `-100` | `--color-destructive-*` | Errors, destructive actions |

Accent scale (`accent-400/500/600`), neutral scale (`neutral-50…950`), and status scales exist for the rare case the semantic alias is insufficient — prefer the alias. Default theme is **dark** (`<html class="dark">`); `.light` re-points `bg`/`surface`/`border`/`fg`/`accent`.

### 2.2 prompt-kit ↔ lifecoach token bridge (required before adoption)

prompt-kit components hardcode shadcn token names (`--background`, `--primary`, `--muted-foreground`, …) in their classNames. Add this bridge to the `@theme` block in `theme.css` so they resolve to our semantic tokens (full block in parity §5 "Color Token Reconciliation"):

```css
@theme {
  --color-background: var(--color-bg);
  --color-foreground: var(--color-fg);
  --color-primary: var(--color-accent);
  --color-primary-foreground: var(--color-accent-fg);
  --color-muted: var(--color-surface-elevated);
  --color-muted-foreground: var(--color-fg-muted);
  --color-ring: var(--color-accent);
  --color-card: var(--color-surface);
  --color-popover: var(--color-surface-elevated);
  --color-destructive: var(--color-destructive-500);
  /* …see parity §5 for the complete mapping */
}
```

Any prompt-kit component that hardcodes a raw color (e.g. `SystemMessage`'s `dark:text-red-800`) must have that line rewritten to the semantic token on adoption. This is the only sanctioned edit to vendored prompt-kit source.

### 2.3 Typography

`--font-sans` = **Geist**, `--font-mono` = **JetBrains Mono** (theme.css). Scale (visual-design §3.2):

| Name | Classes | Use |
|---|---|---|
| `display` | `text-3xl font-semibold tracking-tight` | Empty-state heading, large metrics |
| `h1` | `text-2xl font-semibold tracking-tight` | View headings, modal title |
| `h2` | `text-lg font-semibold` | Section headings, sheet titles |
| `h3` | `text-base font-medium` | Card titles |
| `body` | `text-sm leading-relaxed` | **Chat text**, card bodies, form fields |
| `small` | `text-xs leading-normal` | Timestamps, badges, metadata |
| `mono` | `font-mono text-xs leading-relaxed` | Tool I/O, code, data values |

Chat prose caps at `max-w-prose` (65ch). `tracking-tight` only on `display`/`h1`.

### 2.4 Spacing & radii

8pt grid (Tailwind 4px unit). Card padding `p-4`; card row gap `space-3`; between-card gap `space-6`; view top padding `pt-6`/`pt-8`. Chat: per-message `px-4 py-3`, consecutive same-sender `mt-1`, sender change `mt-4`.

| Radius | Use |
|---|---|
| `rounded-sm` (4px) | Badges, status pips, chips |
| `rounded-md` (8px) | **Default card / button / tool-disclosure** |
| `rounded-lg` (12px) | Composer field, modals, sheet content |
| `rounded-xl` (16px) | Sheets; user bubble (`rounded-xl rounded-br-sm`) |
| `rounded-full` | Avatars, status dots, toggles |

### 2.5 Elevation, motion, focus

- **Elevation by restraint** (visual-design §5): background-change for lists; `border border-border` for cards; `border + bg-surface-elevated` for popovers; the single `--shadow-composer` for the on-scroll composer. No `shadow-md+`.
- **Motion**: `--ease-out-smooth` / `--ease-in-smooth` (theme.css). Transition color/opacity/transform only; 150–500ms. Respect `prefers-reduced-motion`.
- **Focus**: global `*:focus-visible` = `2px solid var(--color-accent)` + 2px offset (global.css). Do not remove it; do not use `:focus` (only `:focus-visible`). Buttons add `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-bg`.
- **Layout constants**: `--tab-bar-height: 56px`, `--composer-height: 64px`, `--chat-bottom-offset`. Mobile lists use `.mobile-safe-bottom`; iOS PWAs use `.safe-pb` / `.safe-pt`.

---

## 3. Composition & naming rules

### 3.1 The prompt-kit composition pattern (use it)

prompt-kit components expose a **compound API**: a `Root` that provides context, named slot sub-components, and a context hook. New composite UI follows the same shape:

```tsx
// Good — compound + context
<Tool>
  <ToolTrigger />
  <ToolContent>…</ToolContent>
</Tool>

// Bad — monolithic, props-soup, everything inline
<ToolCallCard status="…" input={…} output={…} timing={…} expanded={…} onToggle={…} />
```

Rules:
- A composite component is a `Root` + slots, sharing state through a React context (e.g. `useReasoningContext`, `usePromptInput`). Do not thread the same prop through three layers.
- Slots are named `<Component><Slot>` (`MessageAvatar`, `ChatContainerContent`, `StepsTrigger`).
- Export the context hook (`use<Component>Context`) only if a child genuinely needs it.

### 3.2 When to Wrap vs Adopt vs Extend

- **Adopt**: import the prompt-kit component as-is from `components/ui/`. No wrapper. (e.g. `Source`, `Loader`, `ScrollButton`.)
- **Wrap**: create `components/<feature>/<Name>.tsx` that renders the prompt-kit component internally and owns lifecoach concerns (context, placeholder, IngestProvider, agent-state, artifact-save). The wrapper is the public name the app imports. (e.g. `Composer` wraps `PromptInput`.)
- **Extend**: only via composition/props/`className` (merged with `cn()`). **Never** copy prompt-kit source and edit it, except the one sanctioned case in §2.2 (retoning hardcoded raw colors to semantic tokens at adoption).

### 3.3 File & directory layout

```
packages/web/src/
  components/
    ui/        ← prompt-kit + shadcn primitives land here (shadcn-configured path)
               ← plus our generic primitives: Button, Badge, Sheet, EmptyState, …
    chat/      ← chat wrappers: Composer, Message, MessageActions,
                 ToolCallDisclosure, ChatView, ThinkingBar wrapper, chat-state, agent-state
    shell/     ← Shell, RailNav, TabBar, GlobalStatus, nav-items
    ingest/    ← DropZone, IngestProvider, IngestSheet (window-level upload — NOT FileUpload)
    inbox/     ← BriefingPanel, inbox cards
  lib/
    cn.ts      ← cn() = clsx + tailwind-merge
    utils.ts   ← re-export shim: `export { cn } from "./cn"` (satisfies prompt-kit's "@/lib/utils")
  styles/
    theme.css  ← @theme tokens + bridge + keyframes (ONLY place tokens live)
    global.css ← resets, focus-visible, scrollbar, safe-area
```

### 3.4 Naming & code conventions

- Components: `PascalCase` file + named export (`export const Foo = …`). Arrow function returning `JSX.Element`. No default exports for components.
- Hooks: `useFoo`, `camelCase` file (`use-profile.ts`).
- Context providers: `FooProvider` + `useFoo` / `useFooActions` (mirror `chat-state.tsx`, `agent-state.tsx`).
- Always merge classes with `cn(...)`; semantic tokens only.
- Icons: `lucide-react`, default `strokeWidth={1.75}`, sizes via `size-4` / `size-3.5` (visual-design §6).
- Import alias: prompt-kit code uses `@/`; our code uses `~/`. Both alias to `src` (parity Step A). Prefer `~/` in lifecoach-authored files for consistency.

---

## 4. Interaction, state & a11y specs

Every interactive component MUST handle these states explicitly. Generated UI that omits empty/loading/error states is incomplete.

### 4.1 Required states

| State | Spec |
|---|---|
| **Empty** | Use `EmptyState` (icon `text-fg-faint`, title `text-sm text-fg-muted`, body `text-xs text-fg-faint`, optional primary CTA). Chat empty = greeting + starter `PromptSuggestion` chips. Centered, `mt-12`. |
| **Loading** | Use `Loader` (`TextDotsLoader` for "agent typing", `CircularLoader` inline/in-button). Skeleton text via `TextShimmer`. Never a blank screen — show structure. |
| **Error** | Inline chat errors → `SystemMessage` (error variant), not raw `[error: …]` text. List/route errors → message + retry affordance. Tool errors → `border-destructive-500/50` + `AlertCircle` + `text-destructive-300` (matches current `ToolCallDisclosure`). |
| **Disabled** | `disabled:opacity-50 disabled:cursor-not-allowed`. Composer send is disabled while empty or while `streaming`. Disabled controls keep their label for screen readers. |
| **Streaming** | Assistant message shows the `▍` pulse cursor; `ThinkingBar` between turns; `ChatContainer` sticks to bottom but yields to user scroll; `ScrollButton` appears when scrolled up. |

### 4.2 Focus management

- Visible focus on every interactive element via global `:focus-visible` (never remove the outline).
- Sheets/dialogs (Radix-backed `Sheet`, `ConfirmDialog`): trap focus, return focus to trigger on close, `Esc` closes.
- After sending a chat message, focus stays in the composer textarea.
- Opening `SessionListSheet` moves focus into the sheet.

### 4.3 Keyboard

- Composer: `Enter` submits, `Shift+Enter` newline (current behavior — preserve).
- Disclosures (`Tool`, `Reasoning`, `Steps`, `ChainOfThought`): toggle on `Enter`/`Space`, expose `aria-expanded` + `aria-controls` (matches current `ToolCallDisclosure`).
- All actions reachable by Tab in DOM order; no positive `tabindex`.
- `Esc` closes any sheet/dialog/popover.

### 4.4 ARIA

- Chat scroller: `role="log"` `aria-live="polite"` `aria-label="Conversation"` (current ChatView — preserve).
- Icon-only buttons MUST have `aria-label` (attach = "Attach file", send = "Send", new = "New conversation").
- Decorative icons/avatars/cursors: `aria-hidden`.
- Disclosures: `aria-expanded` + `aria-controls={id}` on the trigger, matching `id` on the content.
- Copy actions: `aria-label` reflects state ("Copy message as markdown" → "Copied").
- Touch targets ≥ 44px (icon buttons use `size-9` + padding to reach 44px on touch; visual-design §10).

---

## 5. Prioritized build order

Ranked by impact on the app's real screens. **Chat is the core surface**, so chat-blocking work leads. Prerequisites (parity §5 Steps A–E: aliases, `lib/utils` shim, Radix installs, `shadcn init`, token bridge, keyframes) are tier 0 and gate everything.

### Tier 0 — Foundation (do first, one-time)
1. Add `@` alias + `tsconfig` paths; create `lib/utils.ts` shim.
2. Install Radix primitives + npm deps; run `shadcn init` (no CSS overwrite).
3. Add the **token bridge** (§2.2) and **keyframes** (`shimmer`, loader set) to `theme.css`.

*Nothing renders correctly until the bridge lands — without it prompt-kit colors fall back to shadcn defaults and break dark/light.*

### Tier 1 — Core chat (highest impact: every session touches these)
1. **Markdown + CodeBlock** (Adopt/replace) — fixes unstyled code in every assistant answer.
2. **ChatContainer + ScrollButton** (Wrap/Adopt) — fixes the autoscroll-fights-user bug during streaming.
3. **Message + MessageActions** (Wrap) — adopt `MessageAvatar` / `MessageContent` / `MessageAction` tooltip pattern under the existing layout.
4. **PromptInput → Composer** (Wrap) — adopt composable internals + loading state; keep ingest + placeholder.
5. **Loader** (Adopt) — single loading primitive; replace the inline `Button` spinner.

### Tier 2 — Agent transparency (the "proof of work" identity)
6. **Tool → ToolCallDisclosure** (Wrap) — adopt prompt-kit `Tool` engine, keep `ToolCallState` mapping.
7. **ThinkingBar + TextShimmer** (Wrap/Adopt) — in-stream thinking indicator bound to `agent-state` + stop.
8. **SystemMessage** (Adopt, retoned) — replace raw `[error: …]` text with proper banners.
9. **Reasoning + ChainOfThought** (Adopt) — surface agent reasoning when available.

### Tier 3 — Enrichment (lower frequency, additive)
10. **PromptSuggestion** (Adopt) — starter chips in empty chat + inbox.
11. **Source** (Adopt) — citation badges when the agent cites URLs.
12. **Steps** (Adopt) — sync/ingest progress traces.
13. **FeedbackBar** (Adopt) — thumbs row (wire backend later).
14. **Image** (Adopt) — agent image rendering.

### Defer / out of scope
- **FileUpload** — `DropZone` + `IngestProvider` cover ingestion; only revisit for in-composer drag.
- **ResponseStream / useTextStream** — we stream real SSE deltas; client-side simulation unneeded.
- **JsxPreview** — `react-jsx-parser` React 19 risk; out of scope (parity Risk 7).

---

## 6. Checklist for any new/generated UI

Before a component is considered done:

- [ ] Uses a prompt-kit base where one exists (§1); otherwise justified as Build.
- [ ] References **semantic theme tokens** only — zero raw `*-zinc/gray/red-*` or `dark:` color classes (§2).
- [ ] Compound + context pattern, not props-soup (§3.1); lives in the correct dir (§3.3).
- [ ] Wraps rather than forks prompt-kit (§3.2).
- [ ] Handles empty / loading / error / disabled / (streaming if chat) states (§4.1).
- [ ] Visible focus, keyboard-operable, correct ARIA, ≥44px touch targets (§4.2–4.4).
- [ ] Classes merged via `cn()`; icons `lucide-react` `strokeWidth={1.75}`.
- [ ] `pnpm -F @lifecoach/web build` passes with zero TS errors.
