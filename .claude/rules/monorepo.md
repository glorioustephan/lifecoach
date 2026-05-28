---
paths:
  - "pnpm-workspace.yaml"
  - "packages/*/package.json"
  - "tsconfig*.json"
  - "turbo.json"
---

# Monorepo Rules

Rules for workspace configuration, package boundaries, and Turborepo readiness.

## Package naming

All workspace packages must use the `@lifecoach/<pkg>` scope. The eight packages are:

| Package name | `name` in package.json |
|---|---|
| `packages/core` | `@lifecoach/core` |
| `packages/schemas` | `@lifecoach/schemas` |
| `packages/cli` | `@lifecoach/cli` |
| `packages/connectors` | `@lifecoach/connectors` |
| `packages/mcp-server` | `@lifecoach/mcp-server` |
| `packages/mcp-alpaca-server` | `@lifecoach/mcp-alpaca-server` |
| `packages/server` | `@lifecoach/server` |
| `packages/web` | `@lifecoach/web` |

Do not add new packages without updating `AGENTS.md` and `docs/index.md`.

## Dependency direction

Dependencies must flow in one direction only:

```
web → server → core → schemas
         ↓
    connectors → core → schemas
         ↓
   mcp-server → core → schemas
         ↓
mcp-alpaca-server → core → schemas
         ↓
        cli → core → schemas
```

Rules:
- `schemas` may not depend on any other `@lifecoach/*` package.
- `core` may depend on `schemas` only.
- `connectors`, `mcp-server`, `mcp-alpaca-server` may depend on `core` and `schemas`.
- `server` may depend on `core`, `schemas`, `connectors`.
- `web` may depend on `server` (via HTTP/API calls at runtime, not at build time) and `schemas` for shared types.
- **Never reverse the dependency arrow.** `schemas` importing from `core` is a build-time error and a logic error.

## No cross-package relative imports

Cross-package imports must use the package name, not relative paths:

- Good: `import { MemoryRepository } from '@lifecoach/core'`
- Bad: `import { MemoryRepository } from '../../core/src/memory/storage/repositories/MemoryRepository'`

Within a package, relative imports are fine. Across package boundaries, always use the scope.

## Turborepo readiness

The monorepo is targeting a Turborepo migration. When editing `package.json` or `turbo.json`, ensure:

1. Every package exposes the following scripts (even if they are no-ops): `build`, `typecheck`, `test`, `lint`.
2. `turbo.json` pipeline shape when created:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "pipeline": {
       "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
       "typecheck": { "dependsOn": ["^build"], "outputs": [] },
       "test": { "dependsOn": ["^build"], "outputs": [] },
       "lint": { "outputs": [] }
     }
   }
   ```
3. `outputs` must list all generated artifacts so Turborepo can cache them.
4. Do not execute the Turborepo migration (removing `pnpm -r` calls, moving `turbo run` to CI) until `monorepo-architect` has reviewed and approved the full plan.

## TypeScript project references

Each package must have a `tsconfig.json` that extends a shared base and does NOT set `outDir` to a location outside its own package directory. Cross-package type resolution must go through package `exports` + `types` fields, not via `paths` hacks.
