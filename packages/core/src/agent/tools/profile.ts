import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";

export const buildProfileTools = (memory: Memory) => [
  tool(
    "get_profile",
    "Read the user's identity profile (name, dosha, allergies, goals, etc.). Returns all known key/value pairs. Call this any time you need stable facts about who the user is.",
    {},
    async () => {
      const profile = memory.identity.get();
      const text =
        Object.keys(profile).length === 0
          ? "(empty — no profile facts on record)"
          : JSON.stringify(profile, null, 2);
      return { content: [{ type: "text", text }] };
    },
  ),

  tool(
    "set_profile",
    "Set a single stable identity fact about the user (e.g. name, dosha, blood type, allergies, timezone). Use this only for things that change rarely. For situational or time-bound facts, prefer `remember`.",
    {
      key: z
        .string()
        .min(1)
        .describe("Camel-case key, e.g. 'name', 'dosha', 'bloodType', 'allergies'"),
      value: z
        .unknown()
        .describe("Value — usually a string, but can be a list or object for things like 'allergies'"),
    },
    async ({ key, value }) => {
      memory.identity.set(key, value);
      return {
        content: [{ type: "text", text: `Profile updated: ${key} = ${JSON.stringify(value)}` }],
      };
    },
  ),
];
