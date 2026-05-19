import chalk from "chalk";
import { Command } from "commander";
import { createLifecoach, forgetDocument } from "@lifecoach/core";

export const registerForget = (program: Command): void => {
  const forget = program
    .command("forget")
    .description("Remove previously-ingested artifacts (documents + derived facts/measurements)");

  forget
    .command("document <id>")
    .description("Purge a document and everything derived from it")
    .action(async (id: string) => {
      const lc = createLifecoach();
      try {
        const result = forgetDocument(lc.storage, id);
        console.log(chalk.green(`Forgot document ${result.documentId}`));
        console.log(chalk.dim(`  facts removed:        ${result.factsRemoved}`));
        console.log(chalk.dim(`  measurements removed: ${result.measurementsRemoved}`));
        console.log(chalk.dim(`  embedding refs:       ${result.embeddingRefsRemoved}`));
        console.log(chalk.dim(`  vectors:              ${result.embeddingVectorsRemoved}`));
        console.log(chalk.dim(`  ingest-history rows:  ${result.ingestedFilesRemoved}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.close();
      }
    });
};
