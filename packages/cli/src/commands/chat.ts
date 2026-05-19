import readline from "node:readline";
import { stdin, stdout } from "node:process";
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import { createLifecoach } from "@lifecoach/core";

const PROMPT = chalk.green("you ❯ ");
/**
 * Burst-coalesce window. Dictation/paste injects multiple lines within microseconds;
 * normal typing has seconds between Enters. 120ms cleanly separates the two.
 */
const BURST_QUIET_MS = 120;

interface Reader {
  next(): Promise<string>;
  close(): void;
}

/**
 * One long-lived readline, period. Recreating per turn was leaking keypress
 * listeners on stdin (every new Interface adds another data→keypress translator,
 * which is what caused `eexxiitt`-style double echo). Close events are *not*
 * wired to terminate the loop — only explicit user action ('exit'/'quit'/SIGINT)
 * ends the session.
 */
const createReader = (): Reader => {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });

  let pendingLines: string[] = [];
  let quietTimer: NodeJS.Timeout | null = null;
  let resolveNext: ((value: string) => void) | null = null;

  const tryFlush = (): void => {
    if (quietTimer) {
      clearTimeout(quietTimer);
      quietTimer = null;
    }
    if (!resolveNext || pendingLines.length === 0) return;
    const text = pendingLines.join("\n");
    pendingLines = [];
    const r = resolveNext;
    resolveNext = null;
    r(text);
  };

  rl.on("line", (line) => {
    pendingLines.push(line);
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(tryFlush, BURST_QUIET_MS);
  });

  // Intentionally do nothing on 'close' — if stdin hiccups, we won't kill the
  // session. User must explicitly type 'exit', 'quit', or press Ctrl-C twice.

  return {
    next(): Promise<string> {
      return new Promise((resolve) => {
        resolveNext = resolve;
        stdout.write(PROMPT);
        // If a burst arrived while the agent was responding, deliver immediately.
        if (pendingLines.length > 0 && !quietTimer) {
          tryFlush();
        }
      });
    },
    close(): void {
      if (quietTimer) clearTimeout(quietTimer);
      rl.removeAllListeners();
      rl.close();
    },
  };
};

export const registerChat = (program: Command): void => {
  program
    .command("chat")
    .description("Open an interactive REPL with your coach")
    .action(async () => {
      const lc = createLifecoach();
      const session = lc.agent.startSession();

      console.log(chalk.bold.cyan("Lifecoach"));
      console.log(
        chalk.dim(
          `Session ${session.id} — type 'exit' or press Ctrl-C twice to end. Paste/dictation is grouped automatically.\n`,
        ),
      );

      const reader = createReader();
      let sigintCount = 0;
      let shouldQuit = false;

      const onSigint = (): void => {
        sigintCount += 1;
        if (sigintCount >= 2) {
          shouldQuit = true;
          console.log(chalk.dim("\n(exiting)"));
          reader.close();
          lc.agent.endSession(session.id);
          lc.close();
          process.exit(0);
        }
        console.log(chalk.dim("\n(press Ctrl-C again to exit, or type 'exit')"));
      };
      process.on("SIGINT", onSigint);

      try {
        while (!shouldQuit) {
          const raw = await reader.next();
          sigintCount = 0;

          const userMessage = raw.trim();
          if (!userMessage) continue;
          if (userMessage === "exit" || userMessage === "quit") break;

          const spinner = ora({ text: "thinking…", color: "cyan" }).start();
          try {
            const result = await lc.agent.chat({ sessionId: session.id, userMessage });
            spinner.stop();
            const toolNote =
              result.toolCalls > 0
                ? chalk.dim(` (${result.toolCalls} tool call${result.toolCalls === 1 ? "" : "s"})`)
                : "";
            stdout.write(`${chalk.cyan("coach ❯")} ${result.assistantText}${toolNote}\n\n`);
          } catch (err) {
            spinner.fail("error");
            console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          }
        }
      } finally {
        process.removeListener("SIGINT", onSigint);
        reader.close();
        lc.agent.endSession(session.id);
        lc.close();
        console.log(chalk.dim("Session ended."));
      }
    });
};
