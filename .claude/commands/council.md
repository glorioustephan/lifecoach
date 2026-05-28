---
description: |
  Fan out a topic to all three domain advisors (financial-advisor,
  productivity-coach-advisor, holistic-wellness-advisor) in parallel, then
  synthesize a cross-domain summary that names overlaps and conflicts. Each
  advisor produces a draft brief under their domain directory.
allowed-tools: Read Glob Grep
argument-hint: [topic]
---

# Council — /council

Topic: **$ARGUMENTS**

Invoke all three domain advisors in parallel via Agent tool. Each advisor receives
the topic and is asked to produce a draft brief under their domain directory.

## Advisor briefs (parallel)

Invoke each of the following agents simultaneously:

### financial-advisor

> Topic: $ARGUMENTS
>
> You are the financial-advisor for lifecoach.
> Assess this topic from a personal-finance and investing perspective.
> Produce a draft brief at `docs/briefs/finance/<slug>.md` (derive a kebab-case slug
> from the topic). Use the `/domain-brief` skill or write the file directly following
> the brief frontmatter convention (status: draft, owner: financial-advisor).
> Focus on: cash-flow implications, investment considerations, financial tracking needs,
> any relevant Monarch/Alpaca data shapes.
> Output: the absolute path to the brief you created, plus a 3-5 sentence summary.

### productivity-coach-advisor

> Topic: $ARGUMENTS
>
> You are the productivity-coach-advisor for lifecoach.
> Assess this topic from a habit, task, and focus management perspective.
> Produce a draft brief at `docs/briefs/productivity/<slug>.md` (derive the same
> kebab-case slug from the topic). Use the `/domain-brief` skill or write directly.
> Focus on: habit-stacking opportunities, GTD/Atomic-Habits/BJ-Fogg framing,
> Todoist/Capacities integration points, nudge prompt content.
> Output: the absolute path to the brief you created, plus a 3-5 sentence summary.

### holistic-wellness-advisor

> Topic: $ARGUMENTS
>
> You are the holistic-wellness-advisor for lifecoach.
> Assess this topic from an Ayurveda, yoga, autoimmunity, and ADHD-in-adults perspective.
> Produce a draft brief at `docs/briefs/wellness/<slug>.md` (derive the same
> kebab-case slug from the topic). Use the `/domain-brief` skill or write directly.
> Focus on: dinacharya/dosha alignment, ADHD-aware nudges, symptom-tracking needs,
> body-first vs. task-first framing.
> Output: the absolute path to the brief you created, plus a 3-5 sentence summary.

## Cross-domain synthesis

After all three advisors have returned, synthesize a cross-domain summary:

```markdown
## Council Synthesis — <topic>

### Overlaps (all three domains agree)
- ...

### Productive tensions (advisors diverge — worth exploring)
- ...

### Conflicts (advisors recommend incompatible approaches)
- ...

### Suggested sequence
Which domain should lead implementation? Which should follow? Why?

### Briefs produced
- finance:      docs/briefs/finance/<slug>.md
- productivity: docs/briefs/productivity/<slug>.md
- wellness:     docs/briefs/wellness/<slug>.md
```

Print the synthesis after the three advisor summaries.
