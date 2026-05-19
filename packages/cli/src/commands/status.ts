import chalk from "chalk";
import { Command } from "commander";
import { createLifecoach } from "@lifecoach/core";

export const registerStatus = (program: Command): void => {
  program
    .command("status")
    .description("Print memory stats")
    .action(async () => {
      const lc = createLifecoach();
      try {
        const profileEntries = lc.memory.identity.entries().length;
        const facts = lc.storage.facts.count();
        const sessions = lc.storage.sessions.count();
        const messages = lc.storage.messages.count();
        const documents = lc.storage.documents.count();
        const measurements = lc.storage.measurements.count();
        const reflections = lc.storage.reflections.count();
        const insights = lc.storage.insights.count();
        const embeddings = lc.storage.embeddings.count();
        const activeTasks = lc.storage.tasks.list({ status: "active", limit: 1_000_000 }).length;
        const totalTasks = lc.storage.tasks.list({ status: "all", limit: 1_000_000 }).length;

        const recent = lc.memory.episodic.recentSessions(1)[0];

        console.log(chalk.bold("Lifecoach status"));
        console.log(`  DB: ${chalk.dim(lc.config.dbPath)}`);
        console.log(`  Model: ${chalk.dim(lc.config.model)}`);
        console.log(`  Embedder: ${lc.embedder.enabled ? chalk.green("on") : chalk.yellow("off")} (dim=${lc.config.embeddingDim})`);
        console.log(`  Todoist:  ${lc.todoist ? chalk.green("connected") : chalk.dim("not configured")}`);
        console.log("");
        console.log(chalk.bold("Memory"));
        console.log(`  profile entries: ${profileEntries}`);
        console.log(`  facts:           ${facts}`);
        console.log(`  documents:       ${documents}`);
        console.log(`  measurements:    ${measurements}`);
        console.log(`  embeddings:      ${embeddings}`);
        console.log(`  reflections:     ${reflections}`);
        console.log(`  insights:        ${insights}`);
        console.log(`  tasks:           ${activeTasks} active / ${totalTasks} total`);
        console.log("");
        console.log(chalk.bold("Episodic"));
        console.log(`  sessions:        ${sessions}`);
        console.log(`  messages:        ${messages}`);
        if (recent) {
          console.log(`  last session:    ${recent.id} started ${new Date(recent.startedAt).toISOString()}`);
        }
      } finally {
        lc.close();
      }
    });
};
