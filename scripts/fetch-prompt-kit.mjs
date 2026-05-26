#!/usr/bin/env node
// One-shot scaffolder: fetches shadcn primitives + prompt-kit components from
// their registries and writes them into packages/web/src/components/ui-kit/.
//
// Why a custom fetcher instead of `npx shadcn add`?
//  - We deliberately target `ui-kit/` (not `ui/`) so kebab-case shadcn files
//    (button.tsx) don't collide with our PascalCase ones (Button.tsx) on the
//    case-insensitive macOS filesystem.
//  - We rewrite `@/components/ui/*` -> `@/components/ui-kit/*` so the imports
//    point at the relocated primitives.
//  - We avoid the interactive `shadcn init` step that would rewrite our CSS.
//
// Run: node scripts/fetch-prompt-kit.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, "../packages/web");
const OUT_DIR = path.join(WEB, "src/components/ui-kit");

const SHADCN_STYLE = "new-york";
const shadcn = (name) =>
  `https://ui.shadcn.com/r/styles/${SHADCN_STYLE}/${name}.json`;
const promptKit = (name) => `https://prompt-kit.com/c/${name}.json`;

// shadcn primitives required by prompt-kit components.
const SHADCN_PRIMITIVES = [
  "button",
  "textarea",
  "tooltip",
  "avatar",
  "collapsible",
  "hover-card",
];

// prompt-kit components. Bundled files (markdown/code-block/response-stream
// appear in several) are written idempotently — identical content each time.
const PROMPT_KIT = [
  // Tier 1 — no shadcn deps
  "response-stream",
  "text-shimmer",
  "file-upload",
  "image",
  "chat-container",
  "code-block",
  // Tier 2 — depend on button/textarea/tooltip/avatar
  "prompt-input",
  "scroll-button",
  "prompt-suggestion",
  "loader",
  "feedback-bar",
  "thinking-bar",
  "system-message",
  "message",
  // Tier 3 — depend on collapsible/hover-card
  "tool",
  "source",
  "steps",
  "chain-of-thought",
  // Tier 4 — bundle multiple
  "markdown",
  "reasoning",
];

const collectedDeps = new Set();
const collectedKeyframes = {};
const writtenFiles = new Set();

function rewrite(content) {
  let out = content;
  // Relocate shadcn primitive imports into ui-kit.
  out = out.replaceAll("@/components/ui/", "@/components/ui-kit/");
  // Strip the leading Next.js "use client" directive (no-op in Vite).
  out = out.replace(/^"use client";?\s*\n/, "");
  out = out.replace(/^'use client';?\s*\n/, "");
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function processRegistry(url, label) {
  const data = await fetchJson(url);
  for (const dep of data.dependencies ?? []) collectedDeps.add(dep);
  for (const dep of data.devDependencies ?? []) collectedDeps.add(dep);
  const kf = data.tailwind?.config?.theme?.keyframes;
  if (kf) Object.assign(collectedKeyframes, kf);

  for (const file of data.files ?? []) {
    const base = path.basename(file.path);
    const target = path.join(OUT_DIR, base);
    if (writtenFiles.has(base)) continue; // first writer wins; content identical
    await writeFile(target, rewrite(file.content), "utf8");
    writtenFiles.add(base);
    console.log(`  wrote ui-kit/${base}  (${label})`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching shadcn primitives…");
  for (const name of SHADCN_PRIMITIVES) {
    try {
      await processRegistry(shadcn(name), `shadcn:${name}`);
    } catch (e) {
      console.error(`  FAILED shadcn ${name}: ${e.message}`);
    }
  }

  console.log("Fetching prompt-kit components…");
  for (const name of PROMPT_KIT) {
    try {
      await processRegistry(promptKit(name), `prompt-kit:${name}`);
    } catch (e) {
      console.error(`  FAILED prompt-kit ${name}: ${e.message}`);
    }
  }

  // Emit a summary file so the human (and Claude) can wire up deps + keyframes.
  const summary = {
    npmDependencies: [...collectedDeps].sort(),
    keyframes: collectedKeyframes,
    filesWritten: [...writtenFiles].sort(),
  };
  await writeFile(
    path.join(__dirname, "prompt-kit-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.log("\nnpm dependencies referenced:", summary.npmDependencies.join(", "));
  console.log("keyframes collected:", Object.keys(collectedKeyframes).join(", "));
  console.log(`\n${writtenFiles.size} files written to ${OUT_DIR}`);
  console.log("Summary written to scripts/prompt-kit-summary.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
