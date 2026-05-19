import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import { createLifecoach } from "@lifecoach/core";

const ask = async (rl: readline.Interface, label: string, fallback?: string): Promise<string> => {
  const hint = fallback ? chalk.dim(` [${fallback}]`) : "";
  const answer = (await rl.question(`${label}${hint}: `)).trim();
  return answer || fallback || "";
};

export const registerInit = (program: Command): void => {
  program
    .command("init")
    .description("Create the local DB, run migrations, and seed your profile")
    .option("--no-profile", "Skip the interactive profile prompts")
    .action(async (opts: { profile: boolean }) => {
      const lc = createLifecoach();
      console.log(chalk.green(`✓ DB initialized at ${lc.config.dbPath}`));

      if (lc.embedder.enabled) {
        console.log(chalk.green(`✓ Embedder: enabled (dim=${lc.config.embeddingDim})`));
      } else {
        console.log(
          chalk.yellow(
            `! Embedder: disabled (no VOYAGE_API_KEY) — recall() will keyword-search facts only`,
          ),
        );
      }

      if (opts.profile === false) {
        lc.close();
        return;
      }

      const existing = lc.memory.identity.get();
      if (Object.keys(existing).length > 0) {
        console.log(chalk.dim("\nExisting profile entries:"));
        for (const [k, v] of Object.entries(existing)) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
        console.log("");
      }

      const rl = readline.createInterface({ input: stdin, output: stdout });
      try {
        const name = await ask(rl, "Preferred name", existing["preferredName"] as string | undefined);
        if (name) lc.memory.identity.set("preferredName", name);

        const dosha = await ask(rl, "Dosha (vata/pitta/kapha or compound)", existing["dosha"] as string | undefined);
        if (dosha) lc.memory.identity.set("dosha", dosha);

        const allergies = await ask(
          rl,
          "Allergies (comma-separated)",
          Array.isArray(existing["allergies"]) ? (existing["allergies"] as string[]).join(", ") : undefined,
        );
        if (allergies) {
          lc.memory.identity.set(
            "allergies",
            allergies.split(",").map((s) => s.trim()).filter(Boolean),
          );
        }

        const goals = await ask(rl, "Top current goals (free text)", existing["goals"] as string | undefined);
        if (goals) lc.memory.identity.set("goals", goals);

        console.log(chalk.green("\n✓ Profile saved."));
      } finally {
        rl.close();
        lc.close();
      }
    });
};
