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

/** Common base config — env handling, cwd, log paths. */
const base = (label) => ({
  cwd,
  interpreter: "none",
  // IMPORTANT: don't set PATH here. Hard-coding PATH overrides whatever the
  // login shell would have constructed, which breaks per-project Node version
  // managers like Volta/nvm/fnm (their shims live at paths we'd have to enumerate
  // explicitly). `script: "/bin/zsh"` with `args: ["-lc", "pnpm …"]` runs the
  // login shell so .zshrc / .zprofile build PATH the same way they would in
  // your interactive terminal — and that's where Volta hooks the shim that
  // resolves Node 22 from the project's package.json `volta` field.
  env: {
    NODE_ENV: "production",
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
