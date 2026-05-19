import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach } from "@lifecoach/core";

export const registerQuery = (program: Command): void => {
  program
    .command("query <question...>")
    .description("Ask the coach a single question and exit")
    .action(async (questionParts: string[]) => {
      const question = questionParts.join(" ").trim();
      if (!question) {
        console.error("Question is empty.");
        process.exit(1);
      }
      const lc = createLifecoach();
      const session = lc.agent.startSession();
      const spinner = ora({ text: "thinking…", color: "cyan" }).start();
      try {
        const result = await lc.agent.chat({ sessionId: session.id, userMessage: question });
        spinner.stop();
        console.log(result.assistantText);
        if (result.toolCalls > 0) {
          console.error(chalk.dim(`(${result.toolCalls} tool call${result.toolCalls === 1 ? "" : "s"})`));
        }
      } catch (err) {
        spinner.fail("error");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      } finally {
        lc.agent.endSession(session.id);
        lc.close();
      }
    });
};
