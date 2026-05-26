# Lifecoach UI Layout Audit

**Scope**: Visual / structural layout audit only (no visual-token color/type review beyond noting design-system violations). Captured via Chrome DevTools MCP against the running dev stack at `http://localhost:3718`.
**Viewports**: Desktop **1440 × 900**, Mobile **390 × 844** (iPhone-class, `mobile,touch`, DPR 3).
**Date**: 2026-05-26.
**Data state**: The dev DB is NOT empty — chat sessions, inbox insights, goals, memory facts, tasks, settings, and sources all rendered real data. Only **Artifacts** and **Finances** rendered empty states. Findings tagged `needs-data, suspected` could not be fully confirmed.

Fix directions reference semantic tokens + the shared primitives (`ViewHeader`, `EmptyState`, `Sheet`, `TabNav`, `FilterBar`, `Card`) per `docs/ui-design-system.md`. **Never** raw palette.

---

## Severity summary

| Severity | Count |
|---|---|
| High | 5 |
| Medium | 7 |
| Low | 6 |

**Highest-severity items** (fix first):
1. **Finances route is a wholesale design-system violation** — raw `slate/green/red/blue-*` palette, `dark:` overrides, gradient bg, `max-w-7xl`, lowercase `Card` (High).
2. **Mobile chat composer collides with / sits behind the bottom TabBar** — composer is outside the scroll container and reserves no `--tab-bar-height` offset (High; affects `/` and `/c/*`).
3. **SessionListSheet rows do not truncate on mobile → 966px horizontal overflow + scrollbar inside the sheet** (High).
4. **Artifacts filter tabs overflow and collide with / are clipped by the Search box** at both widths (High).
5. **`ViewHeader` (`max-w-2xl`) is not aligned with route content/tab containers**, which vary between `max-w-2xl`, `max-w-3xl`, full-width, and `max-w-7xl` — systemic header/content edge misalignment (High, cross-cutting).

---

## Cross-cutting (fix once in shared primitives, apply everywhere)

### C1. Inconsistent content max-width vs. `ViewHeader` — High
`ViewHeader` hardcodes `mx-auto max-w-2xl` for its inner row (`components/ui/ViewHeader.tsx:11`). Route content containers do **not** agree:
- Inbox / Tasks / Artifacts content: `mx-auto max-w-2xl` (aligned with header ✓)
- **Memory** content: `mx-auto max-w-3xl` (`routes/memory.tsx:47`) → content column is 768px / left:451, header is 672px / left:504 → **left edges misaligned by ~53px** (measured).
- **Finances** content: `mx-auto max-w-7xl` (`routes/finances.tsx:148`) → header centered in 2xl, content nearly full-width → severe misalignment.
- `TabNav` and `FilterBar` have **no** max-width wrapper at all (full bleed).

**Fix direction**: Introduce a single layout convention. Either (a) make `ViewHeader` accept/derive the same `max-w-*` as the page body, or (b) standardize all routes on one width (recommend `max-w-2xl` for reading-width views, with an explicit opt-in `wide` prop on `ViewHeader` for data-dense ones like Memory). Then make `TabNav`/`FilterBar` wrap their contents in the same `mx-auto max-w-* px-4 md:px-6` so the active-tab underline starts at the same x as the title and cards.

### C2. `TabNav` content is full-bleed while header + body are centered — High
`components/ui/TabNav.tsx` (both `underline` and `pill` variants) only sets `px-4 md:px-6` with no `mx-auto max-w-*`. On Inbox, Memory, Settings the tab row's left edge (x=240, page edge) does not align with the centered title/content column (x≈451–504). Measured on Inbox: tabs row left:240/right:1440; cards left:499/right:1171.

**Fix direction**: In `TabNav`, wrap the `<nav>` children in `<div className="mx-auto flex max-w-2xl ... px-4 md:px-6">` (width matching C1), keeping the border-b full-bleed on the outer element so the rule still spans the viewport.

### C3. Hover-only action affordances are unreachable on touch — Medium
Several surfaces reveal actions only on `group-hover` / `md:group-hover/card`, with no touch fallback:
- `SessionListSheet.tsx:119` — Archive button `group-hover:flex` (never appears on mobile sheet).
- `routes/artifacts.tsx:343` — card action row `md:opacity-0 md:group-hover/card:opacity-100`.

**Fix direction**: On coarse-pointer / `<md`, render these always-visible (e.g. `flex md:hidden` fallback or `@media (hover: none)` always-on), or add an explicit overflow/`MoreHorizontal` menu. Keep hover-reveal only at `md+`.

### C4. Double stacked horizontal rules under headers — Low
`ViewHeader` ends in `border-b border-border`; the immediately-following `TabNav` starts with `border-b border-border-subtle`. Two adjacent 1px rules of different tones read as a visual seam on Inbox/Memory/Settings.

**Fix direction**: Drop the `border-b` from `ViewHeader` when a `TabNav` follows (or remove `TabNav`'s top border) so only one divider shows; standardize on `border-border-subtle` for the lower rule.

### C5. `EmptyState` primitive not used consistently — Medium
The shared `EmptyState` (`components/ui/EmptyState.tsx`, centered, `mt-12`, semantic tokens) is bypassed by hand-rolled empty states in `routes/artifacts.tsx` (centered heading + **left-aligned** bullet list), `routes/inbox.tsx` (`mt-10` custom block), `routes/finances.tsx` (raw-palette block), and the chat empty state (`ChatView.tsx:273`).

**Fix direction**: Route these through `EmptyState` (extending it to accept a body node for the artifacts bullet list). At minimum unify spacing (`mt-12`) and ensure body copy alignment matches the centered heading.

### C6. Layout uses hardcoded `56px` instead of `--tab-bar-height` token — Low
`global.css:53` `.mobile-safe-bottom { @apply sm:pb-[calc(56px+1rem)] md:pb-0; }` hardcodes the tab-bar height; theme defines `--tab-bar-height: 56px` and `--chat-bottom-offset`. The padding also ignores `safe-area-inset-bottom` that `TabBar` adds via `.safe-pb`.

**Fix direction**: `pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom)+0.5rem)]`. Also note the breakpoint split: `.mobile-safe-bottom` keys off `sm:` (≥640) while `TabBar` is `md:hidden` (<768) — consistent in the 640–767 band, but the magic numbers should derive from the same token.

---

## Chat — `/` and `/c/$sessionId` (`components/chat/ChatView.tsx`, `Composer.tsx`)

### Desktop (1440×900)
- **Empty-state vertical placement — Low.** Greeting block is top-anchored (`mt-12`, measured greeting top:48 right under the header) leaving a large empty void between the chips and the bottom composer. Reads as "stuck to the top" rather than balanced. *Where*: `ChatView.tsx:273`. *Fix*: center the empty block in the available scroll height (e.g. wrap in a `flex min-h-full flex-col items-center justify-center` container) instead of `mt-12` top-anchoring.
- **ScrollButton visible with nothing to scroll — Low.** The floating "Scroll to latest message" button (`ScrollButton`, `ChatView.tsx:341`) appears in the empty state and on short threads where the list isn't overflowing (present in the a11y snapshot of the empty `/`). *Fix*: gate visibility on actual scroll overflow / `useStickToBottomContext().isAtBottom` so it only shows when scrolled up.
- **Chat header is not `ViewHeader` and spans full width — Low.** The chat header (`ChatView.tsx:223`) is a bespoke full-width `h-12` bar with an `absolute left-1/2` centered title, while the message list + composer are centered in `max-w-2xl`. Title is centered to the *viewport*, not the content column, so it doesn't line up with the conversation column. *Fix*: acceptable as a distinct chat chrome, but consider centering the title over the `max-w-2xl` column, or constrain the header inner like `ViewHeader`.
- **Centered title can collide with edge buttons — Low (needs-data, suspected).** `<h1 className="absolute left-1/2 -translate-x-1/2 ...">` has no `max-w`/truncate. "New conversation"/"Conversation" fit, but a longer future title would run under the menu (left) and New (right) buttons. *Fix*: add `max-w-[60%] truncate px-12` to the centered title.

### Mobile (390×844)
- **Composer collides with / hides behind the bottom TabBar — High.** Confirmed on both `/` and `/c/*`: composer wrap measured top:747→bottom:844 (h:97); TabBar is `position:fixed` top:788→bottom:844 (h:56). The composer's lower ~56px (textarea bottom:823, Send button bottom:821) sits **behind** the TabBar; the placeholder text is clipped at the viewport bottom. *Where*: the composer wrapper `ChatView.tsx:350` (`<div className="border-t border-border-subtle bg-bg pt-2">`) is a **sibling of the scroller**, so `.mobile-safe-bottom` (applied only to the scroll content at `ChatView.tsx:271`) never offsets the composer. *Fix*: add bottom clearance to the composer wrapper on mobile only: `pb-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] md:pb-0` (or move the TabBar offset onto the chat's outer flex column). This is the single most visible mobile defect.
- **Starter chips stack full-width — Low.** Chips wrap to one-per-line on mobile (`flex flex-wrap justify-center gap-2`, `ChatView.tsx:283`); acceptable, but each chip is centered/auto-width producing ragged widths. *Fix*: optional — `w-full` chips or a 2-col grid for tidier rhythm.

---

## Conversation history — SessionListSheet (`components/chat/SessionListSheet.tsx`, `components/ui/Sheet.tsx`)

### Desktop
- **OK.** Left sheet, measured 400px wide (`md:w-[400px]`), anchored left, header `h-12`, rows truncate correctly, archive button reveals on row hover. No overflow.

### Mobile
- **Row labels don't truncate → horizontal overflow inside the sheet — High.** Measured: sheet `[role=dialog]` width 332px, inner `<ul>` `scrollWidth: 966px` vs `clientWidth: 287px` → overflowing, producing a horizontal scrollbar in the sheet body. Long session titles ("Reply with a bulleted list of 2 things and **bo…") are hard-clipped at the sheet edge instead of ellipsizing. *Where*: `SessionListSheet.tsx:89–113`. *Root cause*: the row is `<li> → <div className="flex items-center"> → <button className="flex-1 ...">`; the `flex-1` button has **no `min-w-0`**, so its inner `truncate` span can't shrink below content width (classic missing-`min-w-0`-on-flex-child). *Fix*: add `min-w-0` to the `flex-1` button (`SessionListSheet.tsx:94`) and to the `flex items-center` row wrapper (line 90). Verify the date `<span>` keeps `shrink-0`.
- **Sheet is `w-[85vw]`, not full-width — Low.** Mobile left sheet leaves a ~15vw sliver of the app visible. Acceptable per Sheet's `max-w-[85vw]` design, but consider `w-full` on `<sm` for a cleaner takeover. *Where*: `SessionListSheet.tsx:54` (`width="md:w-[400px] w-[85vw]"`).
- **Archive action unreachable on touch — Medium** (see C3).

---

## Ingest sheet / DropZone (`components/ingest/*`)
- **Trigger surfaced via Composer "Attach file" + window-level DropZone.** The composer exposes an "Attach file" icon button (`aria-label="Attach file"`, present in snapshots at both widths). The window-level `DropZone` overlay only manifests on an active drag, which cannot be exercised through the MCP without a real file-drag gesture. **Not visually audited** — `needs-data, suspected`. Recommend a manual pass: verify (a) the drag overlay is full-viewport and centered at both widths, (b) `IngestSheet` (if it renders as a bottom/right Sheet) is full-width on mobile and doesn't sit behind the TabBar.

---

## Inbox — `/inbox` (`routes/inbox.tsx`, `components/inbox/BriefingPanel.tsx`)

### Desktop
- **Tabs misaligned with content column — High** (instance of C2). "Active/Snoozed/Acted/Dismissed" underline starts at page edge (x=240) while BriefingPanel + cards are centered (x≈499). Very visible.
- **OK otherwise.** BriefingPanel, insight cards, priority badges, action footer all well-spaced in `max-w-2xl` (`routes/inbox.tsx:123`).

### Mobile
- **Good.** Full-width cards, readable padding, TabBar at bottom, content scrolls under it with `mobile-safe-bottom`. Header subtitle truncates ("…your m…") as expected.
- **`Generate` button can wrap — Low.** Header action label is fine on inbox, but compare with Artifacts where "Generate now" wraps to two lines (see Artifacts).

---

## Goals — `/goals` (`routes/goals.tsx`)
- **Desktop & Mobile: Good.** "ACTIVE PROJECTS" chips + "THIS WEEK" goal card with progress bar, all centered in an aligned `max-w-2xl` column (no TabNav, so no C2 issue). Large empty space below with sparse data is expected.
- **Low (needs-data, suspected)**: many active-project chips would wrap; verify chip wrap gap rhythm with a longer list.

---

## Memory — `/memory` (`routes/memory.tsx`)

### Desktop
- **Content column wider than & misaligned with header — High** (instance of C1): content `max-w-3xl` (768px) vs header `max-w-2xl` (672px); left edges off by ~53px.
- **Tabs misaligned** (C2). Otherwise fact rows with `health` badges and dividers look clean.

### Mobile
- **Good.** TabNav (3 tabs) fits, fact list full-width with proper padding, scrolls under TabBar. This is the reference "correct" mobile list behavior.

---

## Artifacts — `/artifacts` (`routes/artifacts.tsx`, `components/ui/FilterBar.tsx`, `TabNav.tsx`)

### Desktop
- **Filter tabs overflow into / are clipped by the Search box — High.** The type tabs ("All / Recipe / Spending Alert / Debt Payoff Plan / Portfolio Snapshot") live in a `flex-1 min-w-0 overflow-x-auto` region next to a search input, all inside one `max-w-2xl` row (`routes/artifacts.tsx:152–177`). Measured: last tab "Portfolio Snapshot" renders at x:1080–1223 while the search box occupies x:928–1152 → tabs render under/through the search; the active-tab underline doubles as a visible scroll indicator at the seam. Screenshot shows "Debt Payoff Plan" cut by the search with a scroll thumb. *Fix*: give the tab scroll region a hard right boundary (`pr-2` + a fade mask) and ensure the search has a fixed/`shrink-0` width with `ml-auto`; better, move the search to its own row on `<md` (stack: tabs row, then full-width search). Consider replacing the bespoke tabs+search with the `FilterBar` primitive (which already lays out search `flex-1` + chips).
- **Empty state**: heading centered, bullet list left-aligned — minor mismatch (C5).

### Mobile
- **Filter tabs + search collision is worse — High.** Same overflow; "Spending Alert" clipped to "Spending /", white scroll thumb visible, search box crammed to the right. *Fix*: as above — stack tabs and search vertically on mobile.
- **Header action "Generate now" wraps to two lines — Low.** `routes/artifacts.tsx` header action button text wraps inside the `ViewHeader` actions slot at 390px. *Fix*: `whitespace-nowrap` on the button, shorten to "Generate" on `<sm` (`<span className="hidden sm:inline"> now</span>`), or icon-only on mobile.

---

## Tasks — `/tasks` (`routes/tasks.tsx`)
- **Desktop: Good.** List centered in aligned `max-w-2xl`; rows measured 65px tall for a single line + project label — generous but acceptable. Header aligned.
- **Low**: task rows are loosely spaced relative to the design system's `p-4` card / `space-3` row guidance; consider tightening single-line rows. `needs-data, suspected` for very long task titles wrapping (saw one 2-line title render fine on desktop).
- **Mobile: not screenshotted individually** but structurally same full-width list as Memory (the correct pattern); low risk.

---

## Sources — redirects to `/settings?tab=sources`

### Functional/layout bug — Medium
The `Sources` rail item links to `/sources`, which **redirects to `/settings?tab=sources`**, but the Settings route **ignores the `?tab=` query param** and renders the **Profile** tab (confirmed: a11y snapshot shows `tab "Profile" selectable selected` on `…?tab=sources`). So the dedicated "Sources" nav entry lands on the wrong tab. Additionally, the rail highlights **Settings** (not Sources) on this route, so the active-nav state is wrong for the Sources entry.
*Where*: `routes/settings.tsx` (tab state initialization), `nav-items.ts` (`Sources` → `/sources`), and the `/sources` redirect.
*Fix*: read the initial tab from `useSearch()`/`?tab=` in the Settings route; or make `/sources` its own route. Reconcile the rail active-state logic in `RailNav.tsx:25` so the Sources item highlights when on its target.

### Sources tab content — Good
Once selected, the Sources card (Todoist / File drop / Google Calendar / Gmail / Capacities with Sync buttons) is clean and aligned at both widths.

---

## Settings — `/settings` (`routes/settings.tsx`)

### Desktop
- **Pill TabNav misaligned with card** (C2). Profile card centered, tabs at page edge.
- **Raw key names shown as labels — Medium.** Field labels render the raw record keys uppercased: "PREFERREDNAME", "DAILY AUTO-EXTRACTION". *Fix*: map to humanized labels ("Preferred name", "Daily auto-extraction") in the route's field list, don't `.toUpperCase()` a camelCase key.

### Mobile
- **Two-column label/value layout is cramped — Medium.** The fixed left label column (~40%) forces the value column very narrow; the GOALS value wraps to ~11 lines, and "PREFERREDNAME"/"DAILY AUTO-EXTRACTION" labels wrap awkwardly. *Fix*: stack vertically on `<md` — `flex-col md:grid md:grid-cols-[...]`, label above value, full-width value.

---

## Finances — `/finances` (`routes/finances.tsx`)

### Both viewports — **High, top priority**
This route was generated outside the design system and violates it wholesale:
- **Raw Tailwind palette + `dark:` overrides everywhere** (forbidden by §2): `text-slate-900 dark:text-slate-50`, `text-green-600 dark:text-green-400`, `text-red-600 dark:text-red-400`, `text-blue-600 dark:text-blue-400`, `bg-slate-200 dark:bg-slate-700`, `bg-green-600`, `border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20`, etc. (`routes/finances.tsx:129,150,157,162,191,199–200,215,236,244,247,252,260,265,278,288,291,300–301,314,331,334,339,347–348,365,375,382,388,394,410,411,414`). Confirmed visually: green Net Worth, blue Savings Rate, blue gradient wash.
- **Gradient page background** `bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900` (line 129) — no other view has a gradient; breaks the flat-`bg-bg` app surface.
- **`min-h-screen` + `max-w-7xl`** (lines 129, 148) — only view that is full-bleed and screen-min-height; misaligns with `ViewHeader`'s `max-w-2xl` (title centered, content nearly edge-to-edge).
- **Lowercase shadcn `Card`/`CardTitle`** — violates the "import `~/components/ui/Button` (PascalCase)" + design-system primitive rules; the metric cards have non-standard padding/typography vs. the app's `Card`.
- **Low-contrast "Sync Financial Data" button** styled unlike any other button in the app.
- **Mobile**: the four metric cards stack full-width and are each very tall with large internal void; the gradient bottom is visible.

*Fix direction*: Re-skin the entire route to the design system — replace all palette with semantic tokens (`text-fg`, `text-fg-muted`, `text-success-500` for positive deltas, `text-destructive-300` for negative, `bg-surface`, `border-border`); drop the gradient and `min-h-screen`; standardize on the shared `Card` and the app's content width (per C1); route the empty state through `EmptyState`; restyle the sync button as the standard primary/secondary `Button`. This is effectively a rewrite of the styling layer of `finances.tsx`.

---

## Appendix — coverage log

| Route / surface | Desktop | Mobile |
|---|---|---|
| `/` chat (empty) | ✓ | ✓ |
| `/c/$id` chat (data) | ✓ | ✓ |
| SessionListSheet | ✓ | ✓ |
| Ingest/DropZone | trigger seen; drag not exercised | trigger seen |
| `/inbox` (data) | ✓ | ✓ |
| `/goals` (data) | ✓ | (structural) |
| `/memory` (data) | ✓ | ✓ |
| `/artifacts` (empty) | ✓ | ✓ |
| `/tasks` (data) | ✓ | (structural) |
| `/sources` → settings | ✓ | (via settings) |
| `/settings` Profile/Sources | ✓ | ✓ |
| `/finances` (empty) | ✓ | ✓ |

No `(browser already running)` / lock errors were encountered. No horizontal overflow at desktop on any route; mobile overflow confined to the SessionListSheet (High, above).
