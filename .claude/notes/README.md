# Claude Code Scaffolding Notes

This directory contains reference documentation for building agentic scaffolding in the lifecoach project.

## Files

- **`claude-code-scaffolding-reference.md`** — Complete, authoritative reference covering:
  1. Subagents (definition format, frontmatter, auto-delegation, example)
  2. Skills (SKILL.md format, discovery, invocation, example with templates)
  3. Slash Commands (legacy `.claude/commands/` format, arguments, examples)
  4. Hooks (all events, matcher syntax, handler types, blocking behavior, complete TSX linting + format + type-check example)
  5. CLAUDE.md vs AGENTS.md (purposes, load order, precedence, recommendations)
  6. Key format reference summary
  7. Critical gotchas for scaffolding builders
  8. Documentation links (current as of May 26, 2026)

## Usage

Read `claude-code-scaffolding-reference.md` to understand the exact formats, current best practices, and implementation details needed to build:

- Custom subagents for specialized tasks (e.g., `ui-engineer`)
- Reusable skills bundled with supporting templates
- Hooks that enforce linting, formatting, type-checking on edit
- Project-level CLAUDE.md and rules for consistent AI-assisted development

## Audience

This is a reference for agents building the actual `.claude/` infrastructure. It's research-only; not executable scaffolding itself.

---

**Last updated:** 2026-05-26  
**Based on Claude Code docs from:** https://code.claude.com/docs/
