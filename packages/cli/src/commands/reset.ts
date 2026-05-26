import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { loadConfig } from "@lifecoach/core";

/**
 * Destructive wipe of the active environment's database (and, unless --keep-raw,
 * the ingested raw files), so the app starts from an empty schema. Snapshots are
 * always preserved. Used to purge the old Capacities title-mirror + Voyage
 * embedding remnants and start fresh.
 *
 * The DB is recreated empty on the next process start (migrations run in openDb),
 * or explicitly via `lifecoach init`.
 *
 * IMPORTANT: stop the server first — SQLite holds the file open while running.
 *   Production:  pm2 stop all && LIFECOACH_ENV=production pnpm lifecoach reset --yes && pm2 restart all
 *   Local:       pnpm lifecoach reset --yes   (then `pnpm dev`)
 */
export const registerReset = (program: Command): void => {
  program
    .command("reset")
    .description(
      "DESTRUCTIVE: wipe the active environment's SQLite DB (and ingested raw files) so it starts empty. Stop the server first. Dry-run unless --yes.",
    )
    .option("--yes", "Actually delete. Without this flag it only prints what would be removed.")
    .option("--keep-raw", "Keep ingested files in <dataDir>/raw; only wipe the database.")
    .action((opts: { yes?: boolean; keepRaw?: boolean }) => {
      const config = loadConfig();
      const env = process.env.LIFECOACH_ENV || process.env.NODE_ENV || "development";

      const targets: string[] = [
        config.dbPath,
        `${config.dbPath}-wal`,
        `${config.dbPath}-shm`,
      ];
      if (!opts.keepRaw && fs.existsSync(config.rawDir)) {
        for (const name of fs.readdirSync(config.rawDir)) {
          if (name === ".gitkeep") continue;
          targets.push(path.join(config.rawDir, name));
        }
      }
      const existing = targets.filter((p) => fs.existsSync(p));

      console.log(chalk.bold(`Environment: ${env}`));
      console.log(chalk.bold(`Data dir:    ${config.dataDir}`));
      console.log();

      if (existing.length === 0) {
        console.log(chalk.dim("Nothing to delete — already clean."));
        return;
      }

      console.log("Will delete:");
      for (const p of existing) {
        console.log(`  ${chalk.red("✗")} ${path.relative(process.cwd(), p)}`);
      }
      console.log(chalk.dim(`(snapshots in ${config.snapshotsDir} are preserved)`));
      console.log();

      if (!opts.yes) {
        console.log(chalk.yellow("Dry run — nothing deleted. Re-run with --yes to confirm."));
        console.log(
          chalk.dim(
            "Production: pm2 stop all && LIFECOACH_ENV=production pnpm lifecoach reset --yes && pm2 restart all",
          ),
        );
        return;
      }

      for (const p of existing) {
        fs.rmSync(p, { recursive: true, force: true });
      }
      console.log(chalk.green(`Deleted ${existing.length} item(s).`));
      console.log(
        chalk.dim("The database is recreated empty on next start (or run `lifecoach init`)."),
      );
    });
};
