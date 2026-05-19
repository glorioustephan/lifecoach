# Lifecoach — Visual Design Spec

> Companion to `ux-spec.md`. This document owns color tokens, typography, spacing, elevation, layout grids, component visual specs, and motion. It does NOT repeat IA decisions. The React engineer builds to this spec.

---

## 1. Mood + Visual References

**The target feeling:** Opening this app should feel like opening a trusted notebook — something slightly warm, deliberately unhurried, quiet. Not clinical. Not a product demo. Not a consumer AI chatbot. The user is reading about their own body and mind; the UI should hold that seriously.

### Reference trio

**1. Bear Notes + Obsidian (dark mode)**
Bear's dark mode establishes the right baseline: warm near-black backgrounds (not pure `#000000`), generous prose line-lengths, and type that has been chosen rather than defaulted. Obsidian adds the "my private knowledge" quality — a density of information that feels curated rather than cluttered. Takeaway: treat content as the primary texture; chrome is negative space.

**2. Monzo (card-based, mobile-native)**
Monzo's native app does something rare: it presents sensitive, numbers-heavy information in a way that feels calm rather than alarming. Rounded cards. Muted accent colors that signal without shouting. Gentle motion on state changes. Takeaway: health data (HRV, glucose, labs) can be presented with the same equanimity that Monzo brings to transaction amounts.

**3. Linear (keyboard-native, tight typographic hierarchy)**
Linear earns its reputation not from colors but from rigorous typographic contrast. Secondary labels are truly secondary; primary content reads at a glance. Their focus on keyboard shortcuts and subtle hover states (not animation-heavy, not flat-dead) is the right register for a power user who built this tool themselves. Takeaway: precision over decoration; states are communicated by opacity + weight, not color-flooding.

### Composite direction

> "Bear's warmth and privacy, Monzo's calm data presentation, Linear's typographic discipline — rendered at the intersection of a personal health journal and a CLI power tool."

Dark is the default mode. Light mode exists (system-follows) but is not the primary surface this spec optimizes for. Every color decision starts from dark.

---

## 2. Color System

### Philosophy

No pure black, no pure white, no fully saturated primaries. The palette is built around a single warm neutral axis with a restrained teal-green accent. Health context demands colors that don't trigger alarm unless something actually requires attention.

### Tailwind v4 `@theme` block

```css
/* app/styles/theme.css — imported once in main.css */
@import "tailwindcss";

@theme {
  /* ─── Neutral axis (warm gray, slightly blue-leaning) ─── */
  --color-neutral-950: oklch(10% 0.008 260);   /* deepest background */
  --color-neutral-900: oklch(13% 0.010 260);   /* page background (dark default) */
  --color-neutral-850: oklch(16% 0.010 260);   /* surface (cards, chat bg) */
  --color-neutral-800: oklch(20% 0.011 260);   /* surface elevated */
  --color-neutral-700: oklch(28% 0.012 260);   /* border, divider */
  --color-neutral-600: oklch(40% 0.010 255);   /* muted icon */
  --color-neutral-500: oklch(54% 0.009 255);   /* muted text */
  --color-neutral-400: oklch(68% 0.008 255);   /* secondary text */
  --color-neutral-300: oklch(80% 0.007 255);   /* body text */
  --color-neutral-100: oklch(93% 0.005 255);   /* primary text */
  --color-neutral-50:  oklch(97% 0.003 255);   /* display text */

  /* ─── Accent: teal-green (calm, health-adjacent) ─── */
  --color-accent-600: oklch(40% 0.12 175);     /* pressed state */
  --color-accent-500: oklch(52% 0.14 175);     /* default accent */
  --color-accent-400: oklch(65% 0.13 175);     /* hover state */
  --color-accent-200: oklch(82% 0.08 175);     /* accent text on dark */
  --color-accent-100: oklch(90% 0.05 175);     /* subtle accent bg */

  /* ─── Semantic status ─── */
  --color-success-500: oklch(58% 0.16 150);
  --color-success-200: oklch(83% 0.10 150);
  --color-warning-500: oklch(68% 0.16  65);
  --color-warning-200: oklch(87% 0.10  65);
  --color-destructive-500: oklch(55% 0.20  20);
  --color-destructive-300: oklch(72% 0.16  20);
  --color-destructive-100: oklch(88% 0.08  20);

  /* ─── Semantic aliases (dark-mode default) ─── */
  --color-bg:               var(--color-neutral-900);
  --color-surface:          var(--color-neutral-850);
  --color-surface-elevated: var(--color-neutral-800);
  --color-border:           var(--color-neutral-700);
  --color-border-subtle:    oklch(22% 0.010 260 / 0.6);
  --color-fg:               var(--color-neutral-100);
  --color-fg-muted:         var(--color-neutral-400);
  --color-fg-faint:         var(--color-neutral-500);
  --color-accent:           var(--color-accent-500);
  --color-accent-fg:        var(--color-neutral-50);
}

/* Light mode overrides — applied when user prefers light or explicitly sets it */
@media (prefers-color-scheme: light) {
  @theme {
    --color-bg:               oklch(97% 0.004 260);
    --color-surface:          oklch(100% 0 0);
    --color-surface-elevated: oklch(96% 0.004 260);
    --color-border:           oklch(88% 0.006 260);
    --color-border-subtle:    oklch(92% 0.005 260 / 0.7);
    --color-fg:               oklch(15% 0.010 260);
    --color-fg-muted:         oklch(45% 0.009 260);
    --color-fg-faint:         oklch(60% 0.008 260);
    --color-accent:           var(--color-accent-600);
  }
}
```

### Semantic token map — "what uses what"

| Token               | Uses                                                        |
|---------------------|-------------------------------------------------------------|
| `bg`                | `<html>`, `<Shell>`, full-bleed page backgrounds           |
| `surface`           | Cards (InsightCard, FactRow), chat message area, sheets     |
| `surface-elevated`  | Popovers, dropdowns, CommandPalette, active nav item        |
| `border`            | Card borders, dividers between sections                     |
| `border-subtle`     | Row separators inside lists, tab underlines                 |
| `fg`                | Body text, message text, form labels                        |
| `fg-muted`          | Secondary metadata (timestamps, source labels, counts)      |
| `fg-faint`          | Placeholder text, inactive tab labels, disabled states      |
| `accent`            | Focus rings, active nav indicator, links, send button       |
| `success-500`       | Connected state (Sources), sync success pip                 |
| `warning-500`       | Sync degraded, HRV anomaly color, stale data indicator      |
| `destructive-500`   | Tool error state, Danger zone labels, delete actions        |

### Overriding prompt-kit defaults

prompt-kit ships with its own Tailwind/CSS variable layer. Map its tokens onto ours via CSS custom properties after the prompt-kit import:

```css
/* Override prompt-kit's default variables to use our palette */
:root {
  --pk-bg:          var(--color-bg);
  --pk-surface:     var(--color-surface);
  --pk-border:      var(--color-border);
  --pk-foreground:  var(--color-fg);
  --pk-muted:       var(--color-fg-muted);
  --pk-accent:      var(--color-accent);
  --pk-radius:      0.5rem;   /* matches our --radius-md */
}
```

The composer `PromptInput` inherits `--pk-surface` and `--pk-border`. Do not re-style the composer's textarea background independently — let the token cascade do the work.

---

## 3. Typography Scale

### Font family choices

| Role               | Family                        | Rationale                                                                                                         |
|--------------------|-------------------------------|-------------------------------------------------------------------------------------------------------------------|
| UI sans-serif      | **Geist** (Vercel, variable)  | Designed for screens; optical spacing tuned at small sizes; not overused in health/SaaS context yet; free, self-hostable |
| Prose / reflection | **Geist** (same, lighter weight) | Consistent axis; reflections and insight bodies don't need a different face — weight distinction is sufficient    |
| Monospace          | **JetBrains Mono** (variable) | Tool call inputs/outputs, memory search results, fact values that are data. Comfortable at small sizes; ligatures are off for data contexts |

Rationale for NOT choosing Inter: Inter is ubiquitous, particularly in shadcn default configs. Every default shadcn app looks like Inter at 14px. Geist has the same neutral-functional DNA but adds visible distinction.

```css
/* In index.html or global CSS */
@font-face { font-family: 'Geist'; src: url('/fonts/GeistVariableVF.woff2') format('woff2-variations'); }
@font-face { font-family: 'JetBrains Mono'; src: url('/fonts/JetBrainsMonoVariableVF.woff2') format('woff2-variations'); }

@theme {
  --font-sans: 'Geist', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

### Type scale

| Name        | Tailwind class(es)                              | px (approx) | Usage                                              |
|-------------|--------------------------------------------------|-------------|----------------------------------------------------|
| `display`   | `text-3xl font-semibold tracking-tight`          | 30px        | Empty state heading, large metric values           |
| `h1`        | `text-2xl font-semibold tracking-tight`          | 24px        | View headings (Memory tabs title), modal h1        |
| `h2`        | `text-lg font-semibold`                          | 18px        | Section headings in Settings, sheet titles         |
| `h3`        | `text-base font-medium`                          | 16px        | Card titles (InsightCard, ConnectorCard)           |
| `body`      | `text-sm leading-relaxed`                        | 14px        | Chat message text, card bodies, form fields        |
| `small`     | `text-xs leading-normal`                         | 12px        | Timestamps, badges, source chips, metadata rows    |
| `mono`      | `font-mono text-xs leading-relaxed`              | 12px        | Tool call input/output, code in messages           |
| `display-num` | `font-mono text-2xl font-semibold tabular-nums` | 24px        | Measurement values (HRV, glucose), task counts    |

**Chat message text specifically:** `text-sm leading-relaxed` at `--font-sans`. Line height of `1.6` (Tailwind's `leading-relaxed`). This is slightly looser than a typical UI label because users are reading paragraphs, not scanning status text. Max prose width: `max-w-prose` (65ch) inside the chat container to prevent line lengths that tire the eyes on wide laptop screens.

**Letter-spacing:** `tracking-tight` only on display and h1. Body and smaller: default (0). Monospace: `tracking-normal`. Do not add `letter-spacing` to body copy.

---

## 4. Spacing + Radii

### Spacing philosophy

8pt grid. Tailwind's default scale is already 4px (1 unit = 0.25rem at 16px base), so multiples of 2 units (`space-2` = 8px, `space-4` = 16px) respect the grid. Odd numbers are allowed only for fine-tuning single-pixel visual tensions.

### Key spacing values

| Token    | px  | Use                                                                              |
|----------|-----|----------------------------------------------------------------------------------|
| `space-1`  | 4px | Icon-to-label gap, metadata chip internal padding                              |
| `space-2`  | 8px | Icon row gaps, tag spacing, between-line small UI                               |
| `space-3`  | 12px| Card internal row gap, input field padding-y                                    |
| `space-4`  | 16px| Card padding, composer padding-x, tab bar icon gap                              |
| `space-5`  | 20px| Section vertical gap inside settings                                            |
| `space-6`  | 24px| Between-card gap in Inbox, between-section divider                              |
| `space-8`  | 32px| View top padding, empty state vertical centering offset                         |
| `space-12` | 48px| Header height (mobile 44px touches this; use min-h-11)                          |
| `space-16` | 64px| Composer area reserved height (incl. tab bar clearance on mobile)               |

### Chat view specific

The chat composer is pinned to bottom. Reserve `pb-[env(safe-area-inset-bottom)]` plus the tab bar height using a CSS variable:

```css
@theme {
  --tab-bar-height: 56px;
  --composer-height: 64px;
  --chat-bottom-offset: calc(var(--tab-bar-height) + var(--composer-height));
}
```

Message list: `px-4 py-3` per message bubble. Consecutive same-sender messages: `mt-1` (tight clustering). Different-sender transition: `mt-4` (visual breath).

### Radius scale

| Token           | Value   | Use                                                          |
|-----------------|---------|--------------------------------------------------------------|
| `rounded-sm`    | 4px     | Badges, confidence pills, status pips, chip tags             |
| `rounded-md`    | 8px     | **Default card radius.** InsightCard, FactRow, TaskRow, ConnectorCard |
| `rounded-lg`    | 12px    | Composer input field, modals, sheet content area             |
| `rounded-xl`    | 16px    | Sheets themselves (top corners on mobile bottom sheet)        |
| `rounded-full`  | 9999px  | Avatar placeholders, status dot indicators, toggle switches   |

User message bubbles: `rounded-xl rounded-br-sm` (iOS bubble convention, upper-right pinned).
Assistant message: no bubble. Full-width, flush to left margin with a subtle left border accent. (See §8.)

---

## 5. Elevation, Borders, and Surfaces

### The rule: trust through restraint

Shadows create depth but also visual noise. In a health data context, unexpected elevation signals importance. Reserve it.

| Technique           | When to use                                                                                           |
|---------------------|-------------------------------------------------------------------------------------------------------|
| **Background change only** (no border, no shadow) | Chat message list, Settings sections, inline list rows   |
| **Subtle border** (`border border-border`)         | Cards (InsightCard, ConnectorCard, FactRow in list mode), composer field, sheet headers  |
| **Border + surface-elevated bg**                  | CommandPalette, dropdown menus, popover tooltips          |
| **Shadow** (`shadow-sm`)                          | Floating action elements only: the composer on scroll (when content scrolls beneath), the modal sheet handle |
| **Shadow-md or higher**                           | NOT USED. Avoid on health app. Reserve for error dialogs only if ever needed.                         |

```css
/* The one shadow token */
@theme {
  --shadow-composer: 0 -1px 0 0 var(--color-border), 0 -8px 24px 0 oklch(0% 0 0 / 0.4);
}
```

The composer gets an upward shadow only when the message list has been scrolled and content underlaps it. Implemented via an intersection observer on the last message.

### Borders vs. dividers

- **Card borders:** `border border-border rounded-md` — the card is a discrete object.
- **Row dividers inside a list:** `border-b border-border-subtle` on all but last-child. No border-box on the list container itself.
- **Section dividers in Settings:** `border-t border-border my-6` — a full-bleed rule, not a card.
- **Sheet header bottom border:** `border-b border-border` — marks the header / content boundary.

---

## 6. Iconography

Lucide React throughout. No mixing of icon sets.

### Size scale

| Context                          | Size         | Tailwind class      | Stroke width |
|----------------------------------|--------------|---------------------|--------------|
| Tab bar icons (mobile)           | 24px         | `size-6`            | 1.75         |
| Rail nav icons (laptop)          | 20px         | `size-5`            | 1.75         |
| Card/row action icons            | 16px         | `size-4`            | 1.75         |
| Inline text icons (chips, badges)| 12px         | `size-3`            | 1.5          |
| Tool call disclosure icon        | 14px         | `size-3.5`          | 1.75         |
| Sheet header action icons        | 20px         | `size-5`            | 1.75         |
| Status dot                       | 8px          | `size-2`            | n/a (circle) |

All Lucide icons: `strokeWidth={1.75}` as the base. This is lighter than Lucide's default (2) and produces a slightly more refined result at these sizes. Never use `strokeWidth={1}` in interactive contexts (contrast-fails at small sizes).

### Icon color

- Active/primary: `text-fg` (`neutral-100`)
- Secondary/metadata: `text-fg-muted` (`neutral-400`)
- Inactive tab: `text-fg-faint` (`neutral-500`)
- Success: `text-success-500`
- Warning: `text-warning-500`
- Destructive: `text-destructive-500`
- Accent (links, active indicator): `text-accent`

---

## 7. Layout Grids Per View

### Chat — mobile

```
┌─────────────────────────────────────────────┐  h: 44px, sticky top-0
│  ← [hamburger]  "Today, 3:14pm"    [⋯]     │  header: bg-bg border-b
├─────────────────────────────────────────────┤
│                                             │
│  ┌── ASSISTANT ─────────────────────────┐  │  mt-4 mx-4
│  │  "Good morning. Here's what I know…" │  │  no bubble; left border accent
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌── TOOL DISCLOSURE ─────────────────┐    │  mx-4 my-1 (inline in stream)
│  │ 🔎 recall  ·  3 hits  ▸ 0.4s  ›   │    │
│  └────────────────────────────────────┘    │
│                                             │
│  ┌── USER ───────────────────────────────┐ │  mr-4 ml-12 mt-4
│  │        "did I finish the labs task?"  │ │  bubble: bg-surface-elevated
│  └───────────────────────────────────────┘ │  rounded-xl rounded-br-sm
│                                             │
│  [thinking indicator]                       │  mt-2 ml-4 (prompt-kit native)
│                                             │
│                                             │
├─────────────────────────────────────────────┤  sticky bottom, above tab bar
│  ┌─────────────────────────────────────┐   │  mx-3 mb-2
│  │ 📎  What do you want to explore…  ↑ │   │  composer: rounded-lg bg-surface
│  └─────────────────────────────────────┘   │  border border-border
├─────────────────────────────────────────────┤  h: 56px, bg-bg safe-area
│  💬      📥(3)    🧠      ✓      ⚙       │  tab bar
└─────────────────────────────────────────────┘
```

**Message list layout rules:**
- List container: `flex flex-col px-4 pb-4 pt-2`
- User messages: `self-end max-w-[80%]` with `ml-auto`
- Assistant messages: `self-start max-w-[90%]` — wider because prose needs room
- Tool disclosures: `self-start w-full max-w-[90%]` — not bubbled, card treatment
- Timestamp over a group of messages: `text-xs text-fg-faint text-center my-3`
- Actions row under assistant message (Copy / Regenerate / Cite): `flex gap-3 mt-2 ml-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity`

### Chat — laptop

```
┌──────────┬──────────────────────────────────────────────────────────────┐
│  240px   │  Session title  "Today, 3:14pm"               [⋯]   [+ New] │
│  rail    ├──────────────────────────────────────────────────────────────┤
│          │                                                              │
│ 💬 Chat  │  [message list — same structure as mobile]                  │
│ 📥 Inbox │  max-w-prose centered in the content column                 │
│ 🧠 Memory│  (content column = viewport - 240px rail)                   │
│ ✓ Tasks  │  Message max-width: min(65ch, 100%)                         │
│ 📡 Source│                                                              │
│ ⚙ Setting│  ─────────────────────────────────────────────────────────  │
│          │  ┌──────────────────────────────────────────────────────┐   │
│ ──────── │  │ 📎  What do you want to explore…              Enter ↑│   │
│ Synced 2m│  └──────────────────────────────────────────────────────┘   │
│ Inbox: 3 │  mx-auto max-w-2xl px-4 pb-6                               │
│ ● Idle   │                                                              │
└──────────┴──────────────────────────────────────────────────────────────┘
```

On laptop, the composer is max-width constrained to `max-w-2xl` and centered. The message column narrows to `max-w-prose` inside that. This prevents the "newspaper column too wide" problem on ultrawide displays.

### Inbox — mobile

```
┌─────────────────────────────────────────────┐
│  Inbox                                  [⋯] │  header
├─────────────────────────────────────────────┤
│  Good morning. 2 insights, 1 reflection.    │  px-4 py-3, text-sm text-fg-muted
│  ─────────────────────────────────────────  │
│  [Today] [This week] [All]                  │  filter chips, px-4 py-2 sticky
│  ─────────────────────────────────────────  │
│  ┌── InsightCard ──────────────────────┐   │  mx-4 mt-3
│  │ HRV trend                 2h ago    │   │
│  │                                     │   │
│  │ Your 7-day HRV is down 12%…        │   │
│  │                                     │   │
│  │ Sources: [HRV 7d] [Calendar]        │   │
│  │                                     │   │
│  │ [Discuss]  [✓ Acted on]  [↓] [⏰] │   │
│  └─────────────────────────────────────┘   │
│  ┌── InsightCard ──────────────────────┐   │  mt-3
│  │ …                                   │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ▼ Reflections (2)                         │  section divider, collapsible
├─────────────────────────────────────────────┤
│  tab bar                                    │
└─────────────────────────────────────────────┘
```

### Memory — mobile

```
┌─────────────────────────────────────────────┐
│  Memory                            🔍      │  header with search icon
├─────────────────────────────────────────────┤
│  [Facts] [Docs] [Measures] [Reflections]   │  scrollable tab strip, sticky
│  ──────────── (Facts tab active) ─────────  │
│  [category: all ▼]   [search…  🔍]         │  px-4 py-2
│  ─────────────────────────────────────────  │
│  ┌── FactRow ──────────────────────────┐   │
│  │ 🥦 Vegetarian since 2019           │   │
│  │    preference · 0.85 ──────── ●    │   │
│  │    chat · Apr 12                   │   │
│  └─────────────────────────────────────┘   │
│  ┌── FactRow ──────────────────────────┐   │
│  │ …                                   │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│  tab bar                                    │
└─────────────────────────────────────────────┘
```

### Tasks — mobile

```
┌─────────────────────────────────────────────┐
│  Tasks                     ↻ Synced 12m    │  sync button in header
├─────────────────────────────────────────────┤
│  ┌── Agent action strip ───────────────┐   │  conditional, mt-2 mx-4
│  │ Agent added "Follow-up labs" · Undo │   │  bg-surface-elevated rounded-md
│  └─────────────────────────────────────┘   │
│                                             │
│  TODAY                                      │  section label: text-xs text-fg-faint
│  ┌── TaskRow ──────────────────────────┐   │
│  │ ○  Follow-up labs results           │   │
│  │    Work · P1 · Today                │   │
│  └─────────────────────────────────────┘   │
│  ┌── TaskRow ──────────────────────────┐   │
│  │ ○  Blood draw fasting               │   │
│  └─────────────────────────────────────┘   │
│  THIS WEEK                                  │  section label
│  …                                          │
├─────────────────────────────────────────────┤
│  tab bar                                    │
└─────────────────────────────────────────────┘
```

### Sources — laptop only in rail

```
┌──────────────────────────────────────────────────────┐
│  Sources                                             │
├──────────────────────────────────────────────────────┤
│  ┌─ ConnectorCard ─────────────────────────────┐    │
│  │  🟢 Todoist           Synced 2m ago         │    │
│  │  Next sync: in 13m    [Sync now] [Activity] │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─ ConnectorCard ─────────────────────────────┐    │
│  │  🟡 Apple Health      Last: 4h ago          │    │
│  │  Background sync                [Activity]  │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─ ConnectorCard ─────────────────────────────┐    │
│  │  ○ File Drop          Drop files anywhere   │    │
│  │  Last: recipes.pdf 3d ago          [Upload] │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  Recent ingestion activity ▸                         │  collapsible feed
│  ─────────────────────────────────────────────────── │
│  parsing recipes.pdf    Done  4 facts                │
│  embedding notes.md     Done  18 chunks              │
└──────────────────────────────────────────────────────┘
```

### Settings — mobile (drill-down)

```
┌─────────────────────────────────────────────┐
│  ← Settings                                 │
├─────────────────────────────────────────────┤
│  ┌── Profile ──────────────────────────┐   │
│  │  James Baker                        │   │  section card
│  │  Name, DOB, timezone, goals…       │   │
│  │                                [›] │   │
│  └─────────────────────────────────────┘   │
│  ┌── Preferences ─────────────────────┐   │
│  │  Theme, session resume, title…     │   │
│  │                                [›] │   │
│  └─────────────────────────────────────┘   │
│  ┌── Account ──────────────────────────┐   │
│  │  Signed in as jamesleebaker@…      │   │
│  └─────────────────────────────────────┘   │
│  Sources →                                 │  nav link row (routes to /sources)
│  Backup & Export →                         │
│                                            │
│  ┌── Danger zone ─────────────────────┐   │  red-tinted border
│  │  Clear history · Reset · Delete…   │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│  tab bar                                    │
└─────────────────────────────────────────────┘
```

---

## 8. Key Component Visual Specs

### 8.1 Chat Message Bubble

prompt-kit provides `<Message>`, `<MessageContent>`, `<MessageAvatar>`. Style via the token overrides in §2 and these conventions.

**User message:**
```
max-w-[80%] ml-auto
bg-surface-elevated
text-fg text-sm leading-relaxed
px-4 py-3
rounded-xl rounded-br-sm
border border-border
```
No avatar. Aligned right. The rounded corner asymmetry is the iOS native cue; it signals "you said this" without needing a label.

**Assistant message:**
No bubble background. Left-accent border treatment instead — quieter, more like reading from a notepad:
```
max-w-[90%]
pl-4 pr-2 py-2
border-l-2 border-accent
text-fg text-sm leading-relaxed
```
The `border-l-2 border-accent` is a 2px left rail in the accent color (teal-green). Subtly marks the coach's voice without boxing it. This is a deliberate departure from most chat UIs.

**Assistant message — streaming (in-progress):**
Same as above but the left border color transitions to `border-neutral-600` (muted) and back to `border-accent` when the stream ends. This is implemented with a CSS class swap, not a keyframe, to keep it simple.

**Avatar:**
No human face (per UX spec §13). A 28×28 circle, `bg-accent/10 rounded-full`, containing a small `size-4` icon (a simple leaf or wave Lucide icon). It appears only on the FIRST message in a consecutive run from the assistant. Subsequent messages in the same run: no avatar, `ml-9` indent to align with the text above.

**Message actions row (copy / regenerate / cite):**
```
flex items-center gap-3 mt-2 pl-1
opacity-0 group-hover:opacity-100 focus-within:opacity-100
transition-opacity duration-150
```
Icons at `size-3.5 text-fg-faint hover:text-fg`. Touch targets padded to 44px with `p-2`. On mobile, always visible (no hover state).

### 8.2 ToolCallDisclosure

Renders inline between messages in the stream. Three states:

**Running:**
```
flex items-center gap-2
px-3 py-2 rounded-md
bg-surface border border-border
text-xs text-fg-muted
```
Left: animated pulse dot (`size-2 rounded-full bg-accent animate-pulse`).
Center: tool name in `font-mono text-fg-faint`, then input summary in `text-fg-muted`.
Right: "running" label + elapsed time counter.

**Completed:**
```
flex items-center gap-2
px-3 py-2 rounded-md
bg-surface border border-border
text-xs text-fg-muted
cursor-pointer hover:bg-surface-elevated transition-colors
```
Left: static icon matching tool name (🔎 for recall, 📝 for remember, etc.) using `size-3.5`.
Center: tool name, result summary ("3 hits"), duration ("0.4s").
Right: `›` chevron for expand.

**Expanded:**
Collapses in the same card. Beneath the summary row, an animated region (see §9 for motion) reveals:
```
border-t border-border mt-2 pt-2
font-mono text-xs text-fg-muted
whitespace-pre-wrap break-all
max-h-48 overflow-y-auto
```
Input labeled `IN:`, output labeled `OUT:`. No JSON syntax highlighting in v1 — plain mono text is sufficient and avoids a code-highlight library dependency.

**Error state:**
Replace `border-border` with `border-destructive-500/50`. Left dot is `bg-destructive-500` (no animation). Error message visible without expanding: `text-destructive-300 text-xs`. Retry affordance: `text-accent text-xs underline cursor-pointer`.

**Multi-tool stacking:**
When >1 tool call backs a single assistant response, render a single parent disclosure: "Used N tools (recall ×2, remember ×1) ▸". Tap expands a list of the individual disclosures stacked inside. Parent has `rounded-md bg-surface border border-border`. Individual children: `rounded-sm border-b border-border-subtle last:border-0 pl-3`.

### 8.3 InboxCard

```
rounded-md bg-surface border border-border
p-4 space-y-3
```

**Header row:**
```
flex items-start justify-between
```
- Left: topic label `text-h3 font-medium text-fg`
- Right: timestamp `text-xs text-fg-muted`

**Body:**
```
text-sm leading-relaxed text-fg
```

**Source chips:**
```
flex flex-wrap gap-1.5 mt-1
```
Each chip: `inline-flex items-center px-2 py-0.5 rounded-sm bg-surface-elevated text-xs text-fg-muted border border-border`

**Action row:**
```
flex items-center gap-2 pt-1 border-t border-border-subtle
```
- "Discuss" button: `text-xs text-accent font-medium hover:text-accent-400 transition-colors min-h-[44px] flex items-center`
- "Acted on" button: same style, `text-fg-muted`
- Dismiss icon: `text-fg-faint`
- Snooze icon: `text-fg-faint`

**Acted-on state:** Card shifts to `opacity-50 grayscale transition-all duration-300`. Not removed immediately — collapses after a 400ms delay to allow Undo.

### 8.4 FactCard (Memory view row)

Two modes: list row (compact) and detail sheet (expanded).

**List row:**
```
flex items-start gap-3 px-4 py-3
border-b border-border-subtle last:border-0
cursor-pointer hover:bg-surface-elevated/50 transition-colors
active:bg-surface-elevated
```
- Left: category icon `size-4 text-fg-muted` (category to icon mapping defined in code)
- Center-top: subject `text-sm font-medium text-fg`
- Center-bottom: body truncated to 1 line `text-xs text-fg-muted truncate`
- Right: confidence pill `text-xs bg-surface-elevated border border-border px-1.5 py-0.5 rounded-sm text-fg-faint`

**Confidence pill color:**
- 0.8–1.0: `text-success-200 border-success-500/30`
- 0.5–0.79: `text-fg-muted border-border`
- <0.5: `text-warning-200 border-warning-500/30`

### 8.5 TaskRow

```
flex items-start gap-3 px-4 py-3
border-b border-border-subtle last:border-0
```
- Left: completion circle `size-5 rounded-full border-2 border-border cursor-pointer hover:border-accent transition-colors`
- Center-top: task title `text-sm text-fg`
- Center-bottom: metadata `text-xs text-fg-muted` — project · priority dot · due date
- Right: optional `text-xs text-warning-200` if overdue

**Priority dot:** inline `size-2 rounded-full` — P1: `bg-destructive-500`, P2: `bg-warning-500`, P3: `bg-neutral-500`, P4: none.

**"New" pip (post-sync highlight):** 60-second highlight using `bg-accent/5 border-accent/20`. Applied as a class that is removed by a timeout in the component.

**Completed state:** `line-through text-fg-faint opacity-60`. Animates in with `transition-all duration-200`.

### 8.6 SyncStatusPill

Used in: rail footer (laptop), header overflow (mobile), ConnectorCard, Tasks header.

```
inline-flex items-center gap-1.5
px-2 py-1 rounded-full
text-xs text-fg-muted
```
Left: status dot `size-2 rounded-full`
- Connected + recent: `bg-success-500`
- Connected + stale (>1h): `bg-warning-500`
- Error: `bg-destructive-500`
- Disconnected: `bg-neutral-600`
- Syncing: `bg-accent animate-pulse`

Text: "Synced 2m ago" / "Error" / "Syncing…"

On click/tap: opens Sources view (or the specific connector sheet if shown inside a ConnectorCard).

### 8.7 SheetHeader

Reused on every bottom sheet / right-side panel.

```
flex items-center justify-between
px-4 py-4
border-b border-border
sticky top-0 bg-surface z-10
```
- Left: sheet title `text-h2 font-semibold text-fg`
- Right: close button `size-5 text-fg-muted hover:text-fg transition-colors` (Lucide `X` icon, wrapped in a 44px touch target)

For sheets with a primary action (Edit, Ingest, etc.):
```
flex items-center justify-between px-4 py-3 border-b border-border
```
- Left: back/close
- Center: title
- Right: primary action `text-accent text-sm font-medium`

Mobile-only: drag handle `mx-auto mt-2 mb-0 w-10 h-1 rounded-full bg-neutral-600` rendered ABOVE the sheet header (outside the sticky region).

---

## 9. Motion + Interactions

### Principles

Health data app. Animations should confirm actions, not entertain. Three rules:
1. Animations that communicate state change are allowed.
2. Animations that draw the eye without meaning are cut.
3. Any animation that takes >300ms for a UI response is too slow.

### Token reference

```css
@theme {
  --ease-out-smooth: cubic-bezier(0.16, 1, 0.3, 1);  /* spring-ish, no overshoot */
  --ease-in-smooth:  cubic-bezier(0.4, 0, 1, 1);
  --duration-fast:   150ms;
  --duration-base:   200ms;
  --duration-slow:   300ms;
  --duration-sheet:  280ms;
}
```

### Specific motion decisions

| Element                        | Motion                                                                                            | Class / implementation                                      |
|--------------------------------|---------------------------------------------------------------------------------------------------|-------------------------------------------------------------|
| Sheet enter (bottom)           | Slide up from `translateY(100%)` to `translateY(0)` with `--ease-out-smooth` 280ms               | shadcn Sheet with Tailwind `data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8` |
| Sheet exit                     | Slide down with `--ease-in-smooth` 200ms                                                          | `data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-8` |
| ToolCallDisclosure expand      | `max-h-0 overflow-hidden` → `max-h-48 overflow-y-auto` with `transition-[max-height] duration-200 ease-out` | CSS height transition via Tailwind                     |
| Insight card dismiss           | `opacity-100 scale-100` → `opacity-0 scale-95 -translate-y-1` 200ms, then height collapses 250ms | Two-stage: first fade+scale, then layout collapse via `max-h` transition |
| Typing indicator (prompt-kit)  | Use prompt-kit's native `TypingIndicator` — three dots with staggered `animate-bounce` (350ms, staggered 75ms each). Override dot color to `bg-accent`. | `--pk-typing-color: var(--color-accent)` |
| Task completion strike-through | `line-through` class added, then `opacity-60` 200ms later via `setTimeout(200)`                   | Staggered class application                                 |
| Send button                    | On submit: brief `scale-95` then back `scale-100` 100ms. No spin. | `active:scale-95 transition-transform duration-100`        |
| Tab bar icon on activation     | Subtle `scale-110` 100ms then back, plus color shift                                              | `transition-transform duration-100 active:scale-110`        |
| New message arrival (from BG)  | `animate-in fade-in slide-in-from-bottom-2 duration-150`                                          | Tailwind animate-in utility                                 |
| "New" pip on task              | Fades in on mount `animate-in fade-in duration-300`, fades out after 60s                          | Controlled by component timer                               |
| SyncStatusPill syncing dot     | `animate-pulse` (Tailwind built-in, 2s cycle)                                                     | Single class                                                |

### What does NOT animate

- Page / route transitions: none. Instant. Route changes in a tool-use heavy app are often triggered by agent actions; animation would feel laggy.
- Settings sections collapsing: height transition only (`max-h` approach), 150ms. No fade.
- Rail nav item active state: color change, no animation.
- Error states appearing: instant — errors should not feel like a polished feature.

---

## 10. Accessibility Tokens

### Focus ring

```css
/* global.css */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  border-radius: var(--radius, 4px);
}

/* For elements that clip (rounded cards), use box-shadow instead */
.focus-ring-inset:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--color-accent);
}
```

Tailwind: apply `focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none` as the standard focus treatment. Do not use `:focus` (shows on click); only `:focus-visible`.

### Contrast ratios — tracked

| Pair                                | Ratio      | WCAG AA requirement | Status   |
|-------------------------------------|------------|----------------------|----------|
| `neutral-100` on `neutral-900` (body text on bg) | 14.2:1 | 4.5:1 (normal text) | Pass     |
| `neutral-400` on `neutral-900` (muted on bg)     | 5.1:1  | 4.5:1               | Pass     |
| `neutral-500` on `neutral-900` (faint on bg)     | 3.8:1  | 3:1 (large text)    | Pass (large only — do not use for body) |
| `accent-500` on `neutral-900` (accent on bg)     | 4.8:1  | 4.5:1               | Pass     |
| `neutral-100` on `neutral-850` (text on surface) | 11.9:1 | 4.5:1               | Pass     |
| `neutral-400` on `neutral-850` (muted on card)   | 4.5:1  | 4.5:1               | Pass (borderline — verify in production) |
| `neutral-100` on `accent-500` (fg on accent btn) | 5.2:1  | 4.5:1               | Pass     |
| `success-200` on `neutral-850`                   | 7.1:1  | 4.5:1               | Pass     |
| `destructive-300` on `neutral-850`               | 5.6:1  | 4.5:1               | Pass     |

**Note on `neutral-500` (fg-faint):** Only ever use for non-text content (placeholder text, decorative dividers, inactive icons). Never use for meaningful text labels. Flag any use of `text-fg-faint` on actual content in code review.

### Semantic HTML requirements

- All interactive elements are `<button>` or `<a>` (not `<div onClick>`).
- Tab bar and rail nav use `<nav>` with `aria-label="Primary navigation"`.
- Current route item has `aria-current="page"`.
- Bottom sheets use `role="dialog" aria-modal="true"` with focus trap (shadcn Sheet handles this).
- ToolCallDisclosure toggle: `<button aria-expanded={isOpen} aria-controls={contentId}>`.
- Chat message list: `role="log" aria-live="polite" aria-label="Conversation"`. New assistant messages do not use `aria-live="assertive"` — polite is correct; the user is reading, not waiting for alerts.
- Confidence pill: has `aria-label="Confidence: 0.85"` not just the number.

### Touch target compliance

Minimum 44×44px for every tappable affordance. Icons smaller than that are wrapped:
```html
<button class="flex items-center justify-center size-11 ...">
  <LucideIcon class="size-4" />
</button>
```

---

## 11. Distinctive Moves

Four visual signatures that prevent this from reading as a default shadcn app.

### 1. The assistant's left-rail voice mark

Most chat UIs box the assistant's reply in a bubble with a background. This app treats the coach's voice differently: no bubble, just a `border-l-2 border-accent` left rail. The coach writes to the page; the user writes into a bubble. This visually establishes the power differential (notebook/letter feeling) and also lets long assistant messages breathe on mobile without the bubble-wrapping problem.

This requires overriding prompt-kit's default message container. Add a CSS class to the `<Message>` component when `role === "assistant"`:
```css
.message-assistant {
  @apply pl-4 border-l-2 border-accent;
  background: none;
  border-radius: 0;
}
```

### 2. The composer at rest — the "what's on your mind" field

The composer in its resting state has a single placeholder that rotates daily (not every load — daily, seeded by date). The placeholders are drawn from categories: physical check-in, emotional state, practical question, reflective prompt. Examples:
- "How are you sleeping this week?"
- "Anything about today's blood work worth noting?"
- "What do you want your coach to know about this week?"

This makes the composer feel less like a search bar and more like the opening of a conversation. Implemented with a deterministic date-seeded selection in the component (no API call). The placeholder fades in with `animate-in fade-in duration-500` on mount.

Additionally: the composer `Send` button is not labeled "Send" and does not show a paper-plane icon. It shows a simple upward arrow `↑` (`ArrowUp` Lucide) at `size-4`. This is consistent with the Apple Messages idiom that phone users already know and avoids the ChatGPT paper-plane that has become genre shorthand.

### 3. The ambient status glow (laptop only)

The left rail status footer contains the "agent state" signal (Idle / Thinking / Tool use). When the agent is actively working, a very subtle radial gradient emanates from the status footer area — a `box-shadow: 0 0 40px 0 oklch(52% 0.14 175 / 0.12)` on the rail footer element. This is imperceptible at rest (Idle) and just barely perceptible when the agent is running. It is not a flashing effect — it is a soft ambient presence.

Implementation: a CSS variable `--agent-glow-opacity` driven by a React context that holds agent state. Transitions with `transition-[box-shadow] duration-500`.

```css
.rail-footer {
  box-shadow: 0 0 40px 0 oklch(52% 0.14 175 / var(--agent-glow-opacity, 0));
  transition: box-shadow 500ms ease-out;
}
```

Tailscale-only, single user — performance is not a concern. This effect will not annoy James.

### 4. Tool call disclosures as "proof of work"

In most LLM chat interfaces, the tool call layer is hidden or minimal. Here, it is intentionally left visible in the conversation history. After the stream completes, the tool disclosure is not collapsed or dimmed — it remains in the message list at full opacity in its "complete" state. A user who scrolls up sees every tool call the agent made in every session.

This is not the default behavior of most chat UIs (many collapse them after the message renders). The deliberate choice to leave them visible is a trust signal: the coach has nothing to hide about how it reached its conclusions. The visual treatment makes them small but readable — they don't compete with message text, but they are not hidden.

---

## 12. What We Intentionally Cut

### Generic chatbot tropes skipped

| Trope                                              | Why cut                                                                                         |
|----------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Stop generation button (floating, prominent)       | The stop affordance exists as a small icon inside the tool-call disclosure (on long-running tools after 10s), not as a floating button that competes with the send button. A floating stop button signals "this AI is unreliable and you need to interrupt it." |
| Paper-plane send icon                              | Overloaded (every LLM chat uses it). Replaced with `↑` arrow — direct, spatial, meaningful.    |
| Typing bubble "the AI is thinking" (separate overlay) | prompt-kit's native typing indicator under the last message is sufficient. No separate thinking modal or overlay. |
| "Regenerate" as a primary CTA                      | Regenerate exists in the message actions row (hidden until hover/tap) — not a primary button. Regenerating a health insight without context for why is rarely useful. |
| Conversation starter cards on empty state          | Empty chat state is a minimal wordmark + one soft prompt ("Good morning, James.") from the agent, not a grid of "Try asking me about..." suggestion cards. Those cards are a product feature for demo mode, not a personal coach. |
| Bubble avatars with initials or stock person icons | The user does not need to see their own initial in a bubble. The user message alignment (right) is the only identification needed. The agent has a small mark, not a face. |
| "Copy code" button on every code block             | A global `copy` action exists in the message actions row. Adding a button to every code block adds visual noise to what is mostly short mono snippets in tool outputs. |
| Emoji reactions on messages                        | Single user. No audience. Reactions are a multiplayer feature. |
| Typing "..." placeholder while waiting             | The tool-call disclosure already shows what is happening. Adding a separate typing animation before the disclosure appears creates a redundant visual layer. prompt-kit's native streaming handles the transition correctly. |
| Brand color gradients on backgrounds               | The background is near-black. The only gradient is the subtle ambient glow on the rail footer, which is data-driven (agent state), not decorative. |

---

## Appendix: File locations for implementation

| Artifact                    | Location (relative to repo root)                          |
|-----------------------------|-----------------------------------------------------------|
| Tailwind `@theme` block     | `app/styles/theme.css`                                    |
| prompt-kit token overrides  | `app/styles/theme.css` (after `@theme`)                   |
| Global focus ring CSS       | `app/styles/global.css`                                   |
| Font files                  | `public/fonts/`                                           |
| Lucide icon size conventions | `src/lib/icons.ts` (re-export with default stroke)       |
| Agent glow CSS var logic    | `src/components/shell/RailFooter.tsx`                     |
| Composer placeholder rotation | `src/lib/composerPlaceholder.ts`                        |
