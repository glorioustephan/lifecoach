import { z } from "zod";
import { getArtifactDescriptor } from "@lifecoach/schemas";
import type { ArtifactPlugin, FormattedArtifact } from "../types.js";

const recipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  servings: z.string().optional(),
  totalTime: z.string().optional(),
  ingredients: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string().min(1)).default([]),
  confidence: z.number().min(0).max(1),
});
type Recipe = z.infer<typeof recipeSchema>;

const itemSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string", description: "The dish name, e.g. 'Lemon Garlic Salmon'." },
    description: {
      type: "string",
      description: "Optional one-sentence summary of the dish.",
    },
    servings: { type: "string", description: "Optional, e.g. '4 servings'." },
    totalTime: { type: "string", description: "Optional total time, e.g. '35 min'." },
    ingredients: {
      type: "array",
      items: { type: "string" },
      description: "Each ingredient with quantity, e.g. '2 tbsp olive oil'.",
    },
    steps: {
      type: "array",
      items: { type: "string" },
      description: "Ordered preparation steps, one instruction per item.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description:
        "2–5 short lowercase classification tags, e.g. 'dinner', 'vegetarian', '30-min', 'high-protein'.",
    },
    confidence: {
      type: "number",
      description:
        "0–1: how confident you are this is a complete, intentional recipe (not a passing mention). Be honest; below 0.7 means 'probably not'.",
    },
  },
  required: ["title", "ingredients", "steps", "confidence"],
};

const format = (data: Recipe): FormattedArtifact => {
  const lines: string[] = [`# ${data.title}`, ""];
  if (data.description) {
    lines.push(data.description, "");
  }
  const meta: string[] = [];
  if (data.servings) meta.push(`**Servings:** ${data.servings}`);
  if (data.totalTime) meta.push(`**Time:** ${data.totalTime}`);
  if (meta.length > 0) {
    lines.push(meta.join(" · "), "");
  }
  lines.push("## Ingredients", "");
  for (const ing of data.ingredients) lines.push(`- ${ing}`);
  lines.push("", "## Steps", "");
  data.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  if (data.tags.length > 0) {
    lines.push("", `_Tags: ${data.tags.join(", ")}_`);
  }
  return {
    title: data.title,
    body: lines.join("\n"),
    tags: data.tags,
    category: "food",
  };
};

export const recipePlugin: ArtifactPlugin = {
  descriptor: getArtifactDescriptor("recipe")!,
  collectionKey: "recipes",
  itemSchema,
  promptHint:
    "recipes: complete dishes with an ingredient list AND ordered preparation steps. " +
    "A casual food mention or a single tip is NOT a recipe.",
  extractItem: (input) => {
    const parsed = recipeSchema.safeParse(input);
    if (!parsed.success) return null;
    return { confidence: parsed.data.confidence, formatted: format(parsed.data) };
  },
};
