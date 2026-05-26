# Claude Code Scaffolding Reference for lifecoach

**Version:** Based on Claude Code docs as of May 26, 2026  
**Purpose:** Authoritative reference for agentic UI development scaffolding mechanisms  
**Audience:** Agents building `.claude/` infrastructure for the lifecoach project

This document describes exactly how to encode UI development rules, automations, and delegations into Claude Code's extensibility layer. Focus is on mechanisms that ensure consistency and prevent bugs in AI-generated UI code.

---

## 1. SUBAGENTS

Subagents are specialized AI assistants running in isolated context windows, each with a custom system prompt, tool constraints, and independent permissions. They're invoked through auto-delegation when Claude detects a task matching their description.

### Definition File Format & Location

**Location:** `.claude/agents/<agent-name>.md`

Each subagent is a single markdown file in the `.claude/agents/` directory. No subdirectories or extra files in the definition.

**File Naming:** Filename (without `.md`) becomes the agent identifier. Example: `.claude/agents/ui-engineer.md` creates the `ui-engineer` subagent.

### Frontmatter Fields

Subagents use YAML frontmatter. All fields except `name` are optional, but `description` is critical for auto-delegation.

```yaml
---
name: ui-engineer
description: |
  Expert React/TypeScript UI development. Use when building React components,
  styling with Tailwind, implementing responsive layouts, or creating accessible
  component libraries. Excels at polished, production-grade interfaces.
model: claude-opus-4-7
tools:
  - Read
  - Edit
  - Write
  - Bash(npm *)
  - Bash(yarn *)
---
```

**Field Definitions:**

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `name` | string | filename | Display name for subagent (optional; inferred from filename) |
| `description` | string | required | Auto-delegation trigger. Claude reads this to decide when to spawn the subagent. Should be 2–3 sentences. Examples: data processing, testing, documentation research. Clear, specific descriptions work best. |
| `model` | string | parent session model | LLM model for this subagent. Use `claude-haiku-4-5` to reduce costs for lightweight tasks, or `claude-opus-4-7` for heavy lifting. |
| `tools` | array | inherited | Tools the subagent can use. If omitted, inherits parent's tools. Scope this tightly: list only what the task needs. Examples: `Read`, `Bash(npm *)`, `Bash(git *)`. |
| `environment` | object | none | Environment variables specific to this subagent. `{ "DEBUG": "true", "NODE_ENV": "test" }` |
| `permissions` | object | inherited | Permission rules (deny, ask, allow) for specific tools. Structure mirrors `settings.json` permissions. |
| `autoMemory` | boolean | true | Enable auto memory for this subagent. If false, subagent doesn't save learnings. |

### Auto-Delegation and Description Guidance

Claude monitors the conversation. When your prompt mentions a task matching a subagent's description, Claude **may** spawn that subagent. Descriptions drive this decision.

**Best practices for descriptions:**

* **Specific intent:** "Research npm package security vulnerabilities" not "Do research."
* **Domain language:** Use terms from the task domain. Example: "Playwright E2E test debugging" tells Claude this is for test automation.
* **Scope boundaries:** "Analyze files under `src/components/`" is clearer than "Component work."
* **Failure modes:** If a description is too broad (e.g., "general coding"), Claude may over-delegate. If too narrow (e.g., "fix line 42 of Button.tsx"), it won't match. Aim for task-size scope.

### Complete Example: ui-engineer Subagent

```markdown
---
name: ui-engineer
description: |
  Expert React/TypeScript UI component development. Use when building React
  components, styling with Tailwind CSS, implementing responsive layouts,
  handling accessibility, or creating component libraries. Works with tsx/css files,
  shadows component interactions, and produces production-grade interfaces.
model: claude-opus-4-7
tools:
  - Read
  - Write
  - Edit
  - Bash(npm *)
  - Bash(yarn *)
  - Bash(pnpm *)
  - Bash(git status *)
  - Bash(git diff *)
autoMemory: true
---

# UI Engineer Subagent

You specialize in building polished, accessible React components with Tailwind CSS.

## Guidelines

- **TypeScript strictness:** Enforce strict types; no `any` without justification
- **Component structure:** Prefer functional components with hooks; use composition over nesting
- **Tailwind approach:** Use utility classes systematically; avoid arbitrary values when defaults exist
- **Accessibility:** Include ARIA labels, semantic HTML, keyboard navigation
- **Performance:** Memoize appropriately; avoid inline function definitions in render
- **File organization:** One component per file; co-locate tests in `__tests__` folder
- **Styling patterns:** Use CSS Modules or Tailwind; keep styles scoped and maintainable

## When to Request Help

If you need to:
- Debug backend API integration → hand to backend engineer
- Configure bundler/tooling → hand to build engineer
- Write complex state logic → ask main session (may need custom hook extraction)

Respond with just the component code and a short explanation. Keep explanations under 3 sentences.
```

### Key Gotchas

* **Tool inheritance:** If you omit `tools`, the subagent inherits the parent session's tools, which may be more than needed. Always explicitly scope.
* **No nested subagents:** Subagents cannot spawn other subagents. They exist in a flat hierarchy.
* **Model cost:** Cheaper models (Haiku) save money but may struggle with complex reasoning. Match model to task complexity.
* **Auto memory is per-repo:** All worktrees of the same repository share one auto memory directory at `~/.claude/projects/<project>/memory/`. Subagent memories are separate from main session.

---

## 2. SKILLS

Skills are reusable, self-contained instruction sets that Claude can invoke (via `/skill-name`) or auto-invoke when relevant. They bundle a main instruction file plus optional supporting files (templates, scripts, examples).

### SKILL.md Format & Location

**Location:** `.claude/skills/<skill-name>/SKILL.md`

Each skill is a directory containing a `SKILL.md` file and optional supporting files.

**Directory Structure Example:**

```
.claude/skills/
├── generate-ui-component/
│   ├── SKILL.md
│   ├── templates/
│   │   ├── button.template.tsx
│   │   └── card.template.tsx
│   └── examples/
│       └── accessible-form.tsx
├── code-review/
│   ├── SKILL.md
│   └── checklist.md
└── lint-and-format/
    └── SKILL.md
```

### Frontmatter Fields

Skills use YAML frontmatter. Frontmatter controls invocation mode and tool access.

```yaml
---
name: generate-ui-component
description: Generate new React components with Tailwind styling and accessibility
tools: Edit, Write, Read, Bash(npm *)
invocation: auto
---
```

**Field Definitions:**

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `name` | string | directory name | Display name (optional; inferred from folder name) |
| `description` | string | (none) | 1–2 sentence summary. Appears in `/help` and triggers auto-invocation. |
| `tools` | string or array | all | Comma/array of allowed tools. Format: `Read, Write, Bash(npm *)`. If omitted, skill inherits parent session tools. |
| `invocation` | string | `manual` | `manual`: User must call `/name`. `auto`: Claude may invoke when relevant (depends on description quality). |
| `model` | string | (none) | Optional; override model for this skill's execution. |
| `subagent` | string | (none) | Optional; run this skill in a named subagent's context instead of main session. |

### Discovery and Triggering

**Manual invocation:** User types `/skill-name` or Claude can type it.  
**Auto-invocation:** Only if `invocation: auto` and description matches the current task. Quality of description matters: vague descriptions get ignored, specific ones trigger reliably.

### Complete Skill Example: generate-ui-component

**File: `.claude/skills/generate-ui-component/SKILL.md`**

```markdown
---
name: generate-ui-component
description: |
  Generate production-grade React components with Tailwind CSS and accessibility.
  Use when creating new UI components, buttons, forms, cards, or responsive layouts.
tools: Read, Write, Edit, Bash(npm *)
invocation: auto
---

# Generate UI Component

Create a new React component following the project's design system and best practices.

## Input

Provide:
1. Component name and purpose
2. Props/interface
3. Visual description or reference
4. Any special behavior (click handlers, validation, etc.)

## Output

Deliver a `.tsx` file with:

### Structure
- Proper TypeScript interface for props
- Functional component with hooks pattern
- Semantic HTML and ARIA labels
- Tailwind CSS for styling (no inline styles)

### Checklist
- [ ] Component is properly typed (no `any`)
- [ ] Responsive design via Tailwind breakpoints
- [ ] Accessible: ARIA labels, semantic HTML, keyboard nav
- [ ] No unnecessary re-renders (memoization if list item or prop-heavy)
- [ ] Props clearly documented via JSDoc
- [ ] Follows project naming conventions

## Templates (reference via @)

Available templates in this skill:
- @templates/button.template.tsx — Reusable button patterns
- @templates/card.template.tsx — Card layout examples
- @examples/accessible-form.tsx — Full form component with validation

Use these as starting points; customize for the use case.

## Common Patterns

### Button with States
\`\`\`tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  children,
}) => {
  const baseStyles = 'font-semibold rounded transition';
  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
  };
  const sizeStyles = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} disabled:opacity-50 disabled:cursor-not-allowed`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
};
\`\`\`

## When to Hand Off

If the component needs:
- Deep backend integration → involve main session or backend subagent
- Complex state management → ask for custom hook extraction
- Animation/motion logic → stay focused; use Tailwind animations

Keep generated components simple, composable, and re-usable.
```

**File: `.claude/skills/generate-ui-component/templates/button.template.tsx`**

```tsx
/**
 * Button Component Template
 * Customize variant and size props to match your design system
 */

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  children,
}) => {
  // Customize these based on your design tokens
  const variantMap = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 active:bg-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  };

  const sizeMap = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`
        font-semibold rounded transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantMap[variant]} ${sizeMap[size]} ${className}
      `}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
};
```

### Key Points on Skills

* **Supporting files:** Store templates, examples, checklists in subdirectories. Skills auto-discover them; use `@path` syntax to reference them in the SKILL.md body.
* **Invocation:** `invocation: manual` means only `/skill-name` triggers it. `invocation: auto` lets Claude call it when relevant (depends on `description`).
* **Subagent integration:** If `subagent: ui-engineer` is set, the skill runs in that subagent's context, not the main session. Useful for isolated, focused work.
* **Tool scoping:** Explicit tool list prevents skill from using dangerous commands. Always scope.

---

## 3. SLASH COMMANDS

Slash commands are the legacy format (now unified with skills). A slash command is a markdown file at `.claude/commands/name.md` that creates a `/name` command. The **recommended approach is skills** (`.claude/skills/name/SKILL.md`), which support the same `/name` invocation plus auto-invocation and bundled supporting files.

### Legacy Format: `.claude/commands/*.md`

**Location:** `.claude/commands/<command-name>.md`

Each command is a single markdown file.

### Frontmatter (Optional)

```yaml
---
description: Brief description of what the command does
allowed-tools: Read, Edit, Bash(git *)
model: claude-opus-4-7
argument-hint: [arg1] [arg2]
---
```

**Fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `description` | string | Shown in `/help`; no auto-invocation in CLI (invocation is manual only) |
| `allowed-tools` | string | Comma-separated tool list: `Read, Write, Bash(npm *)` |
| `model` | string | Override LLM model for this command |
| `argument-hint` | string | Display hint for arguments, e.g., `[issue-number] [priority]` |

### Argument Handling

Arguments are available via `$1`, `$2`, etc., and `$ARGUMENTS` for all args combined.

**Example command:** `.claude/commands/fix-bug.md`

```markdown
---
description: Fix a reported bug with context
argument-hint: [bug-id] [priority]
---

# Fix Bug

Fix bug #$1 with priority level: $2

Get the bug details, understand the root cause, and implement a fix.
All args: $ARGUMENTS
```

**Usage:** `/fix-bug 42 high` → `$1` = "42", `$2` = "high"

### Bash Execution in Commands

Commands can embed bash output using backticks:

```markdown
---
description: Show current test status
---

## Test Status

Current test results:
!`npm test -- --listTests 2>/dev/null | head -10`

## Tasks

Review the above and recommend improvements.
```

The `!` prefix executes the command and inlines the output.

### File References

Use `@path` to inline file contents:

```markdown
---
description: Review configuration
---

# Configuration Review

Review these configs for issues:
- @package.json
- @tsconfig.json
- @.env.example

Check for security issues, outdated deps, and misconfigurations.
```

### Key Differences: Commands vs. Skills

| Feature | Commands | Skills |
|---------|----------|--------|
| Location | `.claude/commands/` | `.claude/skills/<name>/` |
| Invocation | Manual (`/name`) only | Manual or auto (`invocation: auto`) |
| Supporting files | Single file only | Bundled directory with templates/examples |
| Tool scoping | Via `allowed-tools` | Via `tools` frontmatter |
| Recommended? | No (deprecated) | Yes (preferred) |

**Migration note:** Existing `.claude/commands/` files continue to work. New commands should use `.claude/skills/` format.

### Example Slash Command

**File: `.claude/commands/lint.md`**

```markdown
---
description: Run linting and fix issues
allowed-tools: Bash(npm *), Bash(yarn *), Bash(pnpm *), Edit
---

# Lint and Fix

Run linting tools on the project:

1. Detect package manager (npm, yarn, pnpm)
2. Run `lint` script if available
3. Run `format` script if available
4. Show summary of changes

All output: !`npm run lint 2>&1 || true`
```

---

## 4. HOOKS

Hooks are deterministic, user-defined shell commands, HTTP endpoints, or LLM prompts that fire at specific lifecycle points in Claude Code. Unlike CLAUDE.md (which guides behavior), hooks **enforce** actions—they run whether or not Claude chooses to.

### Complete Hook Event List

| Event | Fires | Use Case |
|-------|-------|----------|
| `SessionStart` | Session begins or resumes | Initialize environment, fetch credentials |
| `SessionEnd` | Session ends | Cleanup, save logs |
| `UserPromptSubmit` | User submits a prompt | Validate input, log queries |
| `UserPromptExpansion` | Slash command expands | Pre-process command args |
| `PreToolUse` | Before any tool call | Validate/block destructive commands, re-route |
| `PermissionRequest` | Permission dialog appears | Log or auto-allow/deny |
| `PermissionDenied` | Tool call denied | Log denial |
| `PostToolUse` | Tool call succeeds | Format/lint output, validate changes |
| `PostToolUseFailure` | Tool call fails | Log error, suggest recovery |
| `PostToolBatch` | Batch of parallel tools finishes | Aggregate results |
| `Stop` | Claude finishes responding | Archive transcript, notify |
| `StopFailure` | Turn ends due to API error | Retry logic |
| `InstructionsLoaded` | CLAUDE.md/rules loaded | Debug which files loaded |
| `ConfigChange` | Config file changes | Reload settings |
| `CwdChanged` | Working directory changes | Update context |
| `FileChanged` | Watched file changes (Bash/Edit) | Trigger checks |
| `PreCompact` / `PostCompact` | Context compaction | Save state before/after |

### Configuration in settings.json

Hooks live in a `hooks` object in `~/.claude/settings.json` (user level), `.claude/settings.json` (project level), or `.claude/settings.local.json` (local/project specific). Project settings override user settings.

**Structure:**

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolName or regex",
        "hooks": [
          {
            "type": "command|http|mcp_tool|prompt|agent",
            "command": "...",
            "timeout": 30,
            "if": "optional permission rule",
            "statusMessage": "optional UI feedback"
          }
        ]
      }
    ]
  }
}
```

### Matcher Syntax

Matchers filter which tool calls trigger the hook:

| Pattern | Matches |
|---------|---------|
| `*` or omitted | All tools |
| `Bash` | Bash tool only |
| `Edit\|Write` | Edit or Write tool |
| `^Notebook` | Tools starting with "Notebook" |
| `mcp__.*__write` | MCP write tools (regex) |

### Hook Handler Types

#### 1. Command Hook (Shell Script)

Most common. Runs a bash script.

```json
{
  "type": "command",
  "command": "/path/to/script.sh",
  "args": ["arg1"],
  "shell": "bash",
  "timeout": 30,
  "async": false
}
```

**Shell form** (safer for complex scripts):
```json
{
  "type": "command",
  "command": "node /path/script.js --flag"
}
```

**Exit codes:**
- `0` = success (parse JSON output if present)
- `2` = blocking error (stderr shown to user)
- Other non-zero = logged but doesn't block

#### 2. HTTP Hook

Posts hook event to an external service.

```json
{
  "type": "http",
  "url": "http://localhost:8080/hook",
  "headers": { "Authorization": "Bearer $API_TOKEN" },
  "allowedEnvVars": ["API_TOKEN"],
  "timeout": 30
}
```

#### 3. MCP Tool Hook

Invokes an MCP server tool.

```json
{
  "type": "mcp_tool",
  "server": "my_server",
  "tool": "validate_code",
  "input": { "code": "${tool_output}" }
}
```

#### 4. Prompt Hook

Uses Claude to evaluate a condition.

```json
{
  "type": "prompt",
  "prompt": "Is this change safe? $ARGUMENTS",
  "model": "claude-opus-4-7"
}
```

#### 5. Agent Hook

Spawns a subagent to evaluate.

```json
{
  "type": "agent",
  "prompt": "Verify this meets our standards: $ARGUMENTS"
}
```

### JSON Input/Output Format

All hooks receive JSON on stdin with the full event context:

```json
{
  "session_id": "abc123",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "tool_input": { "file_path": "src/Button.tsx", "... ": "..." },
  "tool_output": "File modified",
  "cwd": "/path/to/project",
  "permission_mode": "auto",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

Hooks can return JSON to influence behavior:

```json
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "Warning: large file modified",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Linting passed"
  }
}
```

### Complete Example: PostToolUse Hook for TSX Linting + Formatting

This hook runs after Edit/Write on `.tsx` files, enforcing Prettier formatting, ESLint rules, and TypeScript compilation.

**File: `.claude/settings.json`**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-tsx.sh",
            "timeout": 60,
            "statusMessage": "Running linting and format checks..."
          }
        ]
      }
    ]
  }
}
```

**File: `.claude/hooks/post-edit-tsx.sh`**

```bash
#!/bin/bash
set -e

# Read hook input from stdin
INPUT=$(cat)

# Extract file path from hook event
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only process .tsx files
if [[ ! "$FILE_PATH" =~ \.tsx$ ]]; then
  exit 0  # Not a TSX file, skip
fi

# Resolve to absolute path
if [[ ! "$FILE_PATH" = /* ]]; then
  FILE_PATH="${PWD}/${FILE_PATH}"
fi

if [[ ! -f "$FILE_PATH" ]]; then
  exit 0  # File doesn't exist
fi

PROJECT_ROOT=$(echo "$INPUT" | jq -r '.cwd // empty')
cd "$PROJECT_ROOT" || exit 0

# Detect package manager
PM="npm"
if [[ -f "pnpm-lock.yaml" ]]; then
  PM="pnpm"
elif [[ -f "yarn.lock" ]]; then
  PM="yarn"
fi

# 1. Format with Prettier (non-blocking)
echo "Formatting with Prettier..." >&2
if $PM exec prettier --write "$FILE_PATH" 2>/dev/null; then
  PRETTIER_STATUS="✓ Formatted"
else
  PRETTIER_STATUS="! Prettier failed (non-blocking)"
fi

# 2. Lint with ESLint (non-blocking)
echo "Running ESLint..." >&2
ESLINT_OUTPUT=$($PM exec eslint "$FILE_PATH" --fix 2>&1 || true)
if echo "$ESLINT_OUTPUT" | grep -q "error"; then
  ESLINT_STATUS="✗ ESLint errors found"
  echo "$ESLINT_OUTPUT" >&2
else
  ESLINT_STATUS="✓ ESLint passed"
fi

# 3. Type-check with tsc (non-blocking)
echo "Type-checking..." >&2
if $PM exec tsc --noEmit "$FILE_PATH" 2>&1 | grep -q "error"; then
  TSC_STATUS="✗ TypeScript errors"
  $PM exec tsc --noEmit "$FILE_PATH" 2>&1 | tail -5 >&2
else
  TSC_STATUS="✓ TypeScript passed"
fi

# Return structured output
cat <<EOF
{
  "continue": true,
  "suppressOutput": false,
  "systemMessage": "Post-edit checks: $PRETTIER_STATUS | $ESLINT_STATUS | $TSC_STATUS",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "formattingStatus": "$PRETTIER_STATUS",
    "lintingStatus": "$ESLINT_STATUS",
    "typeCheckStatus": "$TSC_STATUS"
  }
}
EOF

exit 0
```

**Permissions required in `.claude/settings.json`:**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm exec prettier *)",
      "Bash(npm exec eslint *)",
      "Bash(npm exec tsc *)",
      "Bash(pnpm exec prettier *)",
      "Bash(pnpm exec eslint *)",
      "Bash(pnpm exec tsc *)",
      "Bash(yarn exec prettier *)",
      "Bash(yarn exec eslint *)",
      "Bash(yarn exec tsc *)"
    ]
  }
}
```

### Blocking vs. Non-Blocking Behavior

**Blocking (exit 2):**
```bash
if [[ "$COMMAND" == *"rm -rf"* ]]; then
  jq -n '{
    continue: false,
    stopReason: "Destructive command blocked"
  }' >&2
  exit 2
fi
```

Stops the tool call entirely. User sees an error.

**Non-blocking (exit 0 with warning):**
```bash
jq -n '{
  continue: true,
  systemMessage: "Warning: Modifying critical file"
}' >&2
exit 0
```

Allows the tool call to proceed but shows a message.

### Path Placeholders

Available in hooks:

- `${CLAUDE_PROJECT_DIR}` — Project root
- `${CLAUDE_PLUGIN_ROOT}` — Plugin installation directory
- `${CLAUDE_PLUGIN_DATA}` — Plugin data directory

### Gotchas and Performance Considerations

1. **Monorepo paths:** Hook scripts must handle relative vs. absolute paths. Extract `cwd` from the JSON input and `cd` into it.
2. **npm/yarn/pnpm detection:** Use presence of lock files (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`) to detect the package manager.
3. **Timeout:** Default is 30s, configurable per hook. Linting + type-checking can exceed this for large projects; increase `timeout` if needed.
4. **Async execution:** Set `"async": true` for long-running hooks (backups, notifications). Async hooks don't block the agent.
5. **JSON parsing:** Always use `jq` for reliable JSON parsing in hooks. Avoid regex on JSON.
6. **Error suppression:** Use `|| true` to prevent bash set -e from exiting on non-critical failures.
7. **Performance impact:** Every `PostToolUse` hook runs on every file edit. Keep them fast (< 5s). Move heavy checks to a separate on-demand skill.

---

## 5. CLAUDE.md vs. AGENTS.md

### Definitions

**CLAUDE.md:** Instructions you write that Claude reads at the start of every session. Content is loaded into the context window as a user message. Influences behavior through guidance, not enforcement.

**AGENTS.md:** Optional file used by other coding agents (Cursor, Windsurf, etc.). Claude Code doesn't read AGENTS.md directly. If your repo uses AGENTS.md for other tools, you should either:
1. Symlink `CLAUDE.md` to `AGENTS.md` (if you want identical content)
2. Import AGENTS.md in CLAUDE.md using `@AGENTS.md` syntax (if you want Claude-specific additions)

### Load Order and Scope

CLAUDE.md files are discovered by walking up the directory tree. Load order from root to working directory:

1. **Managed policy CLAUDE.md** (system-level, cannot be excluded)
2. **User-level CLAUDE.md** (`~/.claude/CLAUDE.md`)
3. **User-level rules** (`~/.claude/rules/` — all `.md` files)
4. **Project-root CLAUDE.md** (`./CLAUDE.md` or `./.claude/CLAUDE.md`)
5. **Project-level rules** (`./.claude/rules/` — all `.md` files)
6. **Nested CLAUDE.md files** (loaded on-demand when Claude reads files in subdirectories)
7. **CLAUDE.local.md** (personal, project-specific; appended at each level after CLAUDE.md)

Within each directory, `CLAUDE.local.md` is appended after `CLAUDE.md`, so personal notes load last.

### Precedence and Conflicts

Later files do **not** override earlier files; all are concatenated. If two CLAUDE.md files contradict each other, Claude may pick one arbitrarily. **Review your CLAUDE.md hierarchy periodically** to remove conflicts.

Use `.claude/rules/` with `paths` frontmatter to scope instructions to specific file types, reducing noise and conflicts.

### Nested and Scoped Placement

**Project root CLAUDE.md:** General project standards, build commands, architecture.

**Path-specific rules:** `.claude/rules/api.md` (with `paths: "src/api/**"`) for API-only instructions.

**Subdirectory CLAUDE.md:** `./packages/web/CLAUDE.md` for monorepo-specific guidance. Loaded on-demand when Claude works in that directory.

**Local CLAUDE.md:** `./CLAUDE.local.md` for personal, non-shared preferences (add to `.gitignore`).

### CLAUDE.md vs. AGENTS.md: Recommended Convention

**If your repo is Claude Code only:**
- Use `./CLAUDE.md` (project root) for team-shared instructions
- Use `~/.claude/CLAUDE.md` for personal preferences
- Use `.claude/rules/` for topic-specific or path-scoped rules

**If your repo is used by multiple agents (Cursor, Windsurf, Claude Code):**

Option 1 (symlink):
```bash
ln -s AGENTS.md CLAUDE.md
```
All tools read the same file. This is simplest if AGENTS.md already exists and covers everyone's needs.

Option 2 (import):
```markdown
# CLAUDE.md

@AGENTS.md

## Claude Code Specific

- Use subagents for isolated research
- Prefer skills for repeatable workflows
```
This lets you share AGENTS.md while adding Claude-specific guidance.

**Current best practice (2026):** Use Option 2 (import) so you can maintain AGENTS.md as the source of truth while documenting Claude-specific conventions.

### Duplication and Symlinks

**Duplication:** Avoid. If you need the same content in two places, use a symlink or an import.

**Symlinks:** Work on macOS and Linux. On Windows, requires Admin or Developer Mode. `.claude/rules/` supports symlinks to shared rule directories, e.g., `ln -s ~/shared-rules .claude/rules/shared`.

**Imports:** Portable across platforms. Use `@path` in CLAUDE.md to include other files at session start.

### Example Project Structure

```
lifecoach/
├── CLAUDE.md                    # Project instructions
├── AGENTS.md                    # (Optional) Shared with other tools
├── .claude/
│   ├── CLAUDE.md               # (Optional) Same as root CLAUDE.md or imports it
│   ├── settings.json           # Hooks, permissions, config
│   ├── settings.local.json      # Personal/local overrides
│   ├── agents/
│   │   ├── ui-engineer.md
│   │   └── backend-engineer.md
│   ├── skills/
│   │   ├── generate-ui-component/
│   │   │   ├── SKILL.md
│   │   │   └── templates/
│   │   └── lint-and-format/
│   │       └── SKILL.md
│   ├── rules/
│   │   ├── frontend.md         # paths: "src/components/**"
│   │   ├── backend.md          # paths: "src/api/**"
│   │   └── security.md         # paths: everywhere
│   └── hooks/
│       ├── post-edit-tsx.sh
│       └── pre-commit.sh
└── packages/
    └── web/
        └── CLAUDE.md           # (Optional) Web-specific rules
```

---

## 6. Key Format Reference Summary

### Directory Structure Checklist

```
.claude/
├── CLAUDE.md                    # (Optional if at root)
├── settings.json                # Hooks, permissions, config
├── settings.local.json          # (Optional) Local overrides
├── agents/
│   └── <name>.md               # One file per subagent
├── skills/
│   └── <name>/
│       ├── SKILL.md            # Required
│       ├── templates/          # Optional supporting files
│       └── examples/
├── commands/                    # (Legacy; prefer skills/)
│   └── <name>.md
├── rules/
│   └── <scope>.md              # with optional paths frontmatter
└── hooks/
    └── <event>.sh              # Referenced in settings.json
```

### Frontmatter Templates

**Subagent:**
```yaml
---
name: short-name
description: Clear, specific task description for auto-delegation
model: claude-opus-4-7
tools: [Read, Edit, Write, Bash(npm *)]
autoMemory: true
---
```

**Skill:**
```yaml
---
name: skill-name
description: What the skill does and when to use it
tools: Read, Write, Bash(npm *)
invocation: manual
---
```

**Command (legacy):**
```yaml
---
description: Short description
allowed-tools: Read, Edit, Bash(git *)
argument-hint: [arg1]
---
```

**Rule (path-scoped):**
```yaml
---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---
```

### Hook Structure
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

---

## 7. Critical Gotchas for Scaffolding Builders

1. **Tool scoping is essential:** Always explicitly list allowed tools. Omitting tools inherits parent's tools, which may be dangerous.

2. **Descriptions drive auto-delegation:** Vague subagent/skill descriptions won't trigger auto-invocation. Be specific about task intent and domain.

3. **JSON I/O for hooks:** Hooks receive JSON on stdin, must return JSON on stdout with proper exit code. Use `jq` for reliable parsing.

4. **Monorepo path handling:** Hook scripts must handle both relative and absolute paths. Extract `cwd` from JSON input.

5. **CLAUDE.md files concatenate, don't override:** If you have conflicting instructions in different CLAUDE.md files, Claude may pick arbitrarily. Use `.claude/rules/` with `paths` scoping to avoid this.

6. **Skills vs. Commands:** Skills are the modern format. Commands still work but are deprecated. Use skills for new workflows.

7. **Subagent memory is separate:** Each subagent has its own auto memory. Main session memory is separate. This is intentional for context isolation.

8. **Hook timeout defaults to 30s:** Linting + type-checking on large projects may exceed this. Increase `timeout` in the hook config if needed.

9. **Async hooks don't block:** Use `"async": true` for backups, notifications, slow operations. Agent continues while hook runs in background.

10. **Settings layer precedence:** `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`. Managed policy settings cannot be overridden.

---

## 8. Documentation References

For the latest details, consult:

- **Subagents:** https://code.claude.com/docs/en/sub-agents.md
- **Skills:** https://code.claude.com/docs/en/skills.md
- **Hooks (guide):** https://code.claude.com/docs/en/hooks-guide.md
- **Hooks (reference):** https://code.claude.com/docs/en/hooks.md
- **Memory & CLAUDE.md:** https://code.claude.com/docs/en/memory.md
- **.claude directory:** https://code.claude.com/docs/en/claude-directory.md
- **Settings:** https://code.claude.com/docs/en/settings.md
- **CLI reference:** https://code.claude.com/docs/en/cli-reference.md

---

**Document version:** 2026-05-26  
**Status:** Reference only. Not executable scaffolding; intended as research for another agent building the actual automation.
