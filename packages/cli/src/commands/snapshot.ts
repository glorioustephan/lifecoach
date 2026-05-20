import path from "node:path";
import chalk from "chalk";
import ora from "ora";
import { Command } from "commander";
import {
  createLifecoach,
  exportSnapshot,
  findWorkspaceRoot,
  importSnapshot,
  loadConfig,
} from "@lifecoach/core";

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export const registerExport = (program: Command): void => {
  program
    .command("export [out]")
    .description("Snapshot the SQLite DB + data/raw/ into a single .tar.gz")
    .option("--no-raw", "Skip data/raw/ files")
    .action(async (outArg: string | undefined, opts: { raw: boolean }) => {
      // Open + close a lifecoach instance so all migrations run on the live DB
      // before we copy it. (Snapshots should always be at the latest schema.)
      createLifecoach().close();
      const config = loadConfig();
      const out = outArg
        ? path.isAbsolute(outArg)
          ? outArg
          : path.resolve(findWorkspaceRoot(), outArg)
        : undefined;

      const spinner = ora({ text: "preparing snapshot…", color: "cyan" }).start();
      try {
        const result = await exportSnapshot(config, {
          ...(out !== undefined ? { out } : {}),
          noRaw: !opts.raw,
          onProgress: (e) => {
            switch (e.phase) {
              case "checkpoint":
                spinner.text = "checkpointing WAL";
                break;
              case "backup-db":
                spinner.text = "backing up SQLite";
                break;
              case "stage-raw":
                spinner.text = `staging ${e.count} raw file${e.count === 1 ? "" : "s"}`;
                break;
              case "manifest":
                spinner.text = "hashing + writing manifest";
                break;
              case "compress":
                spinner.text = "compressing";
                break;
              case "done":
                break;
            }
          },
        });
        spinner.succeed(`Wrote ${result.path}`);
        console.log(chalk.dim(`  size:           ${formatBytes(result.size)}`));
        console.log(chalk.dim(`  schema version: ${result.manifest.schemaVersion}`));
        const counts = result.manifest.counts;
        const interesting = ["facts", "documents", "messages", "tasks", "goals", "reflections", "insights"];
        for (const k of interesting) {
          const v = counts[k] ?? 0;
          if (v > 0) console.log(chalk.dim(`  ${k.padEnd(15)} ${v}`));
        }
        console.log(chalk.dim(`  files:          ${result.manifest.files.length}`));
      } catch (err) {
        spinner.fail("export failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });
};

export const registerImport = (program: Command): void => {
  program
    .command("import <archive>")
    .description("Restore a snapshot (.tar.gz) into the current data directory")
    .option("--force", "Overwrite existing data/lifecoach.db")
    .option("--dry-run", "Validate the archive without applying")
    .action(async (archivePath: string, opts: { force: boolean; dryRun: boolean }) => {
      const config = loadConfig();
      const resolved = path.isAbsolute(archivePath)
        ? archivePath
        : path.resolve(findWorkspaceRoot(), archivePath);

      const spinner = ora({ text: "validating archive…", color: "cyan" }).start();
      try {
        const manifest = await importSnapshot(config, resolved, {
          force: opts.force,
          dryRun: opts.dryRun,
          onProgress: (e) => {
            switch (e.phase) {
              case "extract":
                spinner.text = "extracting";
                break;
              case "verify":
                spinner.text = "verifying hashes";
                break;
              case "apply":
                spinner.text = "applying";
                break;
              case "done":
                break;
            }
          },
        });
        if (opts.dryRun) {
          spinner.succeed("Archive is valid (dry-run, nothing applied)");
        } else {
          spinner.succeed("Restored");
        }
        console.log(chalk.dim(`  created:         ${new Date(manifest.createdAt).toISOString()}`));
        console.log(chalk.dim(`  source host:     ${manifest.sourceHost}`));
        console.log(chalk.dim(`  schema version:  ${manifest.schemaVersion}`));
        const counts = manifest.counts;
        const interesting = ["facts", "documents", "messages", "tasks", "goals", "reflections", "insights"];
        for (const k of interesting) {
          const v = counts[k] ?? 0;
          if (v > 0) console.log(chalk.dim(`  ${k.padEnd(15)} ${v}`));
        }
        console.log(chalk.dim(`  files:           ${manifest.files.length}`));
      } catch (err) {
        spinner.fail("import failed");
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });
};
