---
title: UI Design Principles — ADHD-aware UX constraints
slug: ui-design-principles
audience: [agents, humans]
owner: technical-writer
status: done
created: 2026-05-28
updated: 2026-05-28
source: authored
consumers:
  - ui-engineer
  - holistic-wellness-advisor
code_paths:
  - packages/web/src/components/**
  - packages/web/src/routes/**
---

# UI Design Principles — ADHD-aware UX constraints

## Why this document exists

The primary user of lifecoach has ADHD. That is not a secondary consideration or an
accessibility footnote — it is the central design constraint. Every user-facing surface must
account for attentional blindness, context-switching costs, working-memory limits, and the
shame spiral that follows a broken streak or an accidental destructive action.

These principles were codified to make that constraint durable. Without a written standard,
each feature makes its own implicit choices. With one, every future surface can be held to
the same bar and reviewers have a citation to point at instead of relitigating every decision.

## How to use this document

- Cite principles by number in code comments when a design choice is non-obvious:
  `// ADHD-3: show next action, not history summary`
- Reference them in PR descriptions when defending a UX decision.
- When reviewing a new component or surface, run the **Compliance checklist** at the bottom.
- This document is complementary to `docs/ui-design-system.md` (component catalog,
  tokens, naming) and `docs/ux-spec.md` (information architecture). Those govern
  *what* to build and *how* to style it. This document governs *how it must behave*.

---

## 1. Single-glance status

Completion state must be readable at a distance, without reading a label. Use filled vs.
outline shape, semantic color (`bg-success-500/80` vs. `border-border`), or check-icon
presence to communicate done/not-done. The user should never have to parse the word "Done"
or "Incomplete" to know which state they are looking at.

This matters for ADHD because label-reading is a conscious, serial act. Visual discrimination
is pre-attentive — it happens before the user has committed attention to the element.

**Apply**

- Habit completion cell: filled circle with checkmark, not a "Done" badge.
- Today-view habit row: `bg-success-500/80` fill when complete; `border-border` outline when
  not; `opacity-40` when cadence is not due today. Three states, zero reading required.
- Goal progress: filled arc segment vs. empty arc — never a percentage label as the primary
  indicator.

**Avoid**

- Status that requires reading a text chip to distinguish ("Completed" vs. "Pending" vs.
  "Skipped" as the only differentiator).
- Gray-on-gray: incomplete vs. disabled must differ by more than a single shade.

---

## 2. Progressive disclosure

The floor for creating any entity is a title and the single minimum required field — nothing
else is blocked. Every other field is optional, surfaced on demand, and editable after the
fact. Never front-load a form with fields the user probably does not know or care about at
creation time.

For ADHD, a long form is a wall. The user opens the dialog, sees six required fields, and
closes it. One field is a door they walk through. More complexity reveals itself only after
they are already inside.

**Apply**

- `NewHabitDialog`: title + cadence selector is the entire required surface. Parent-goal
  linkage, notes, and advanced options live behind an "Add details" disclosure.
- `NewGoalDialog`: title + kind (outcome / process / identity) is the floor; due date,
  metric target, and linked habits are all optional expansions.
- Sheet tabs (Overview / Calendar / History): the default tab shows the most actionable
  information; richer history is one tap away but not the default view.

**Avoid**

- Requiring dueAt, parentGoalId, notes, and cadence all before a habit can be saved.
- Showing advanced options expanded by default "just in case the user needs them."

---

## 3. Visible next action

Every card and row surfaces what to do next — not a summary of past activity. The primary
affordance on a habit card is the today-cell that the user can tap to complete. The primary
affordance on a task card is a checkbox. The primary affordance on a goal card is the next
linked habit or milestone due.

ADHD working memory does not reliably hold "what should I do about this?" across a context
switch. The surface answers the question before the user has to ask it.

**Apply**

- `HabitCard` in Today view: the today-cell is the largest and most prominent element on
  the card — larger than the title at mobile widths.
- `TaskCard`: checkbox is left-edge, reachable with a thumb without reading the title.
- `GoalCard`: next due habit or milestone is shown as a secondary line below the title, not
  hidden in the edit sheet.

**Avoid**

- Cards that show only historical data (last completed, created date) with no forward-facing
  affordance.
- "View" as the only CTA — every card should be actionable in place for the common case.

---

## 4. No-shame streak language

Show recovery, not loss. When a habit was not completed yesterday, show "Last: 2d ago" —
not "Streak broken" and not "0-day streak." When a streak is active, show it positively
("7-day"). Never frame lapsed completion as failure.

Streak breaks trigger shame spirals in ADHD users. Shame leads to avoidance, which leads to
longer gaps, which leads to the user abandoning the tracker entirely. The language of recovery
keeps the door open.

**Apply**

- `StreakBadge`: active streak → `7-day`. Gap → `Last: 3d ago`. Never started → omit the
  badge entirely rather than showing "0-day."
- Onboarding copy for habits: "Tap to mark done. Miss a day? Just tap the next one." — not
  "Build your streak."
- Toast after completing a habit: "Logged." or "7-day streak." — not "Don't break it!"

**Avoid**

- "You broke your N-day streak."
- Showing a flame icon that goes grey or explicitly extinguishes.
- Any copy that implies the user failed or should have done better.

---

## 5. Respect prefers-reduced-motion

All flip, fade, slide, bounce, and shimmer animations must be gated on the
`prefers-reduced-motion: reduce` media query. Use Tailwind's `motion-safe:` and
`motion-reduce:` variants or the CSS media query directly. Animations that bypass this gate
are a bug, not a style choice.

For ADHD (and for users with vestibular disorders), unexpected or persistent motion is
physiologically disruptive — not merely annoying. The habit completion flip is satisfying for
users who want it; for users who do not, it must be absent entirely.

**Apply**

- `HabitCell` completion flip: wrap in `motion-safe:` Tailwind variant.
  `// ADHD-5: gate flip on prefers-reduced-motion`
- `StreakBadge` pulse: CSS animation class applied only under `@media (prefers-reduced-motion: no-preference)`.
- `TextShimmer` and `Loader` keyframe animations: check that the `theme.css` keyframe
  registration is wrapped in `@media (prefers-reduced-motion: no-preference)` at the
  `@keyframes` level, or that the utility class is guarded.

**Avoid**

- Inline `transition-all` without a `motion-reduce:transition-none` counterpart.
- Continuously looping background animations on any persistent UI chrome.

---

## 6. Quick reversal

Every destructive or assertive action — completing a habit, archiving a goal, deleting a
completion, bulk-creating items — must have an immediate undo path. The standard patterns are
a toast with an "Undo" CTA (visible for ≥5 seconds) and a one-click revert from a detail
view. Confirmation dialogs are a second-best option; prefer undo-over-confirm for reversible
actions.

ADHD impulsivity means users act before they are certain. A safe floor — "I can always undo
this" — reduces the cost of acting decisively, which is exactly the behavior the app wants
to encourage.

**Apply**

- Tapping a habit cell: optimistic update immediately; toast `Logged — Undo` visible for 5s.
  Undo tap sends `DELETE /api/habits/:id/completions/:completionId`.
- Bulk-creating items via `ProposalReviewModal`: toast `Created 5 habits and 1 task — View`
  with no undo at the toast level (too complex); instead, the "View" CTA routes to `/habits`
  where individual habits can be archived or deleted.
- Archiving a habit: toast `Archived — Undo` for 5s; undo calls `PATCH` with `status: active`.

**Avoid**

- Destructive actions with no recovery path (hard delete without confirmation or undo).
- Undo toasts that disappear after 2s — ADHD users may not be looking at the screen.
- Confirmation dialogs for low-risk reversible actions ("Are you sure you want to mark this
  done?") — they add friction without adding safety.

---

## 7. High contrast for complete vs incomplete

Complete and incomplete states must be distinguishable by color AND shape — not color alone
(accessibility) and not shape alone (insufficient visual weight). Use the full semantic
success token stack (`bg-success-500`, `text-success-200`) for complete, and a clearly
differentiated outline treatment for incomplete. Never rely on a single shade difference or
a subtle opacity shift as the only signal.

For ADHD, high-salience completion states provide the dopamine feedback loop that makes
tracking rewarding. Low-contrast completion is not just an accessibility gap — it removes
the reward.

**Apply**

- Habit cell done: `bg-success-500/80` fill + checkmark icon. Habit cell empty-past:
  `border border-border` outline, no fill, no icon.
- Task checkbox done: `bg-accent` fill + check. Undone: `border-2 border-border-subtle`.
- Goal status badge: `bg-success-500/20 text-success-200` for on-track;
  `bg-warning-500/20 text-warning-200` for stalled; `border-border text-fg-muted` for inactive.

**Avoid**

- Done = `opacity-60` of the undone state — a single dimension change.
- Green text on a dark card where the only contrast is text color vs. background.
- Using only a check icon with no fill change on the cell background.

---

## 8. Survive context switches

Selections, scroll positions, expanded disclosures, and sheet states must persist across
route changes within a session. When the user navigates away and returns, they should find
the list exactly where they left it. Use TanStack Query's cache and React Router state
scrolling to achieve this; do not reset view state on unmount unless the user explicitly
triggered a reset action.

Context-switching is unavoidable for ADHD users — they will receive a notification, open
the app, answer the notification, and return to where they were. If the app has reset, they
must re-orient from scratch. That re-orientation cost compounds across a day of interrupted
sessions.

**Apply**

- `/habits` Calendar view: selected month and horizontal scroll position persist when the
  user opens a `HabitDetailSheet` and closes it.
- `/goals` list: expanded goal card (showing habits/milestones) stays expanded on return
  from a nested route.
- `GoalEditSheet` open tab (Overview / Habits / Tasks / History): store in component state
  or URL hash; do not reset to the Overview tab on every open.

**Avoid**

- Resetting list filters to default on every mount.
- Collapsing all expanded disclosures when the user navigates away and back.
- Losing the scroll position in a long list after closing a sheet.

---

## 9. One required field per step

When a flow requires multiple decisions, decompose it into one decision per visible step.
No five-page wizards. No single form with five required fields. The modal or sheet surfaces
one required input, then reveals the next only after the first is complete — or presents
optional extras behind a clear "Add more" disclosure.

Decision fatigue is amplified in ADHD. A form with five required fields is five opportunities
to abandon the task. A form with one required field is one opportunity, and the user is
already inside the flow before they face the next decision.

**Apply**

- `ProposalReviewModal` bulk-confirm: the primary path is "review candidate cards, click
  Create N items." Goal grouping is a secondary collapse that is not required. Advanced
  per-item editing is available but not surfaced by default.
- Multi-step onboarding (if ever introduced): one question per screen, back-navigation
  always available, progress indicator showing "2 of 4" not "Step 2 of a 4-step wizard."
- `NewHabitDialog`: title → cadence → optional extras. Two fields before the save button
  is reachable; no field is blocked behind another required field.

**Avoid**

- Blocking the primary CTA until all optional fields are filled.
- Showing all optional fields expanded at open time.
- "Complete your profile before you can create a habit" gates.

---

## 10. Predictable interaction surfaces

The same gesture means the same thing everywhere. Tap a cell or checkbox to toggle
completion. Long-press (or tap an edit icon) to open the detail sheet. Swipe-left to archive
or delete. These interaction patterns must be consistent across every list surface in the
app — habits, tasks, goals — so the user never has to re-learn.

ADHD users rely on procedural memory more heavily than working memory for interface
navigation. An inconsistent interface forces conscious re-evaluation on every interaction,
which is exhausting. A consistent one runs on autopilot after a few sessions.

**Apply**

- Tap to toggle: habit cells, task checkboxes, milestone checkboxes all toggle on a
  single tap. No hover-to-reveal required to trigger the primary action.
- Edit sheet: tapping the card title or a dedicated edit icon opens the detail sheet on
  every list type. The gesture is the same on `/habits`, `/tasks`, and `/goals`.
- Undo toast: same visual format (same `Toast` component, same position, same duration)
  for every undoable action across the app.

**Avoid**

- Some lists using swipe-to-complete and others using tap-to-complete.
- Some edit sheets opening on row tap and others requiring a "..." menu to reach.
- Different confirmation patterns for the same semantic action on different routes.

---

## Reviewing for compliance

Run this checklist when reviewing any new component or UI surface.

- [ ] Status is communicated visually (shape + color), not only by text label. (P-1)
- [ ] The creation or edit flow requires at most two fields before the primary action is
      reachable; everything else is optional or disclosed on demand. (P-2)
- [ ] The default card or row view surfaces a forward-facing action, not only history. (P-3)
- [ ] All streak or cadence copy uses recovery framing, not loss framing. (P-4)
- [ ] All animations are wrapped in `motion-safe:` / `prefers-reduced-motion: no-preference`. (P-5)
- [ ] Every assertive or destructive action has a toast-Undo path or a one-click revert. (P-6)
- [ ] Complete vs. incomplete uses both color AND shape — not a single dimension. (P-7)
- [ ] List scroll position, expanded state, and selected month persist across
      in-session route changes. (P-8)
- [ ] No form or modal requires more than one field before the save/confirm CTA is
      active. (P-9)
- [ ] Tap-to-toggle, edit-on-title-tap, and undo-toast format are consistent with every
      other list surface in the app. (P-10)
