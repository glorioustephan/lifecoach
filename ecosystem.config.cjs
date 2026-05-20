/**
 * PM2 ecosystem config for Lifecoach.
 *
 * Four processes:
 *  - lifecoach-server         long-lived Hono web/API server
 *  - lifecoach-daily-reflect  daily reflection at 06:00 local
 *  - lifecoach-insights       daily insight pass at 07:30 local
 *                             (runs AFTER the daily reflection so the
 *                              insighter has the morning summary in context)
 *  - lifecoach-weekly-reflect weekly reflection Sundays at 19:00 local
 *
 * Each cron job runs `cron_restart` semantics — autorestart is off,
 * PM2 fires the process on schedule, it runs and exits, PM2 waits.
 *
 * Why `zsh -lc`?
 *   PM2's spawn environment is minimal. `zsh -lc` triggers .zshrc /
 *   /etc/zprofile so $PATH resolves pnpm + node + corepack consistently
 *   with your interactive shell, no matter how pnpm was installed.
 *
 * Setup:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup          # generates a launchd plist that boots pm2 itself
 *
 * Inspect:
 *   pm2 status
 *   pm2 logs lifecoach-server
 *   pm2 logs lifecoach-daily-reflect --lines 100
 *
 * Trigger a cron job manually (skip the next schedule):
 *   pm2 restart lifecoach-daily-reflect
 */

const path = require("node:path");
const cwd = __dirname;
const logsDir = path.join(cwd, "data", "logs");

/**
 * The PATH passed to every PM2 child. We explicitly prepend Volta's shim
 * directory (and a few common Node-manager dirs) so per-project Node
 * version resolution works even when:
 *   - PM2 is resurrected by launchd with a minimal PATH on reboot
 *   - `/bin/zsh -lc` runs non-interactively (where Volta's .zshrc setup
 *     is often gated behind an `if interactive` check and skipped)
 *   - The daemon's stored PATH is stale from an earlier shell session
 *
 * The Volta shim at ~/.volta/bin/node reads the cwd's package.json,
 * finds the `volta.node` pin, and execs the matching binary. So with
 * Volta first in PATH, every child gets the project's pinned Node
 * regardless of how it was invoked.
 */
const home = process.env.HOME || "";
const childPath = [
  `${home}/.volta/bin`,
  `${home}/.volta/shims`,
  `${home}/Library/pnpm`,
  `/opt/homebrew/bin`,
  `/opt/homebrew/sbin`,
  `/usr/local/bin`,
  process.env.PATH || "/usr/bin:/bin",
].join(":");

/** Common base config — env handling, cwd, log paths. */
const base = (label) => ({
  cwd,
  interpreter: "none",
  env: {
    NODE_ENV: "production",
    PATH: childPath,
  },
  out_file: path.join(logsDir, `${label}.out.log`),
  error_file: path.join(logsDir, `${label}.err.log`),
  merge_logs: true,
  time: true,
});

module.exports = {
  apps: [
    {
      name: "lifecoach-server",
      script: "/bin/zsh",
      args: ["-lc", "pnpm --filter @lifecoach/server start"],
      ...base("lifecoach-server"),
      autorestart: true,
      max_restarts: 10,
      min_uptime: "30s",
      max_memory_restart: "1G",
    },
    {
      name: "lifecoach-daily-reflect",
      script: "/bin/zsh",
      args: ["-lc", "pnpm -w run lifecoach reflect daily"],
      ...base("daily-reflect"),
      autorestart: false,
      cron_restart: "0 6 * * *",
    },
    {
      name: "lifecoach-insights",
      script: "/bin/zsh",
      args: ["-lc", "pnpm -w run lifecoach insights generate"],
      ...base("insights"),
      autorestart: false,
      cron_restart: "30 7 * * *",
    },
    {
      name: "lifecoach-weekly-reflect",
      script: "/bin/zsh",
      args: ["-lc", "pnpm -w run lifecoach reflect weekly"],
      ...base("weekly-reflect"),
      autorestart: false,
      cron_restart: "0 19 * * 0",
    },
  ],
};
