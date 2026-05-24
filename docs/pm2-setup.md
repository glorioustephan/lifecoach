# Running Lifecoach with PM2

[PM2](https://pm2.keymetrics.io/) supervises the long-running server **and** the scheduled background-intelligence jobs from one config file: `ecosystem.config.cjs` at the repo root.

If you already use PM2 for other services, Lifecoach slots in next to them — no separate launchd setup, no system-level cron entries.

## What gets supervised

| Process | Schedule | What it does |
|---|---|---|
| `lifecoach-server` | always running, auto-restart on crash | the Hono HTTP+API server (default port 3717) |
| `lifecoach-sync-todoist` | every 30 minutes (`*/30 * * * *`) | `lifecoach sync todoist` — pulls Todoist tasks into local storage |
| `lifecoach-daily-reflect` | 06:00 daily | `lifecoach reflect daily` |
| `lifecoach-insights` | 07:30 daily | `lifecoach insights generate` (runs after the morning reflection so it has fresh context) |
| `lifecoach-weekly-reflect` | 19:00 Sunday | `lifecoach reflect weekly` |

Logs land in `data-{env}/logs/<name>.{out,err}.log` — the directory is created automatically by the ecosystem config on startup; gitignored. Cron-style commands also record a durable run ledger in SQLite (`job_runs` + `job_locks`) with status, duration, error summary, and generated row references.

The `{env}` prefix comes from `LIFECOACH_ENV` (or `NODE_ENV`) in the environment. On a production Mac Mini you'd set `LIFECOACH_ENV=production`, so logs land in `data-production/logs/`. In local dev they land in `data-development/logs/`.

## Install

From the repo root on the machine you're deploying to:

```bash
# Once, on the deployment machine
npm i -g pm2          # or: brew install pm2

# Start everything
pm2 start ecosystem.config.cjs

# Persist the process list, then generate a launch agent that brings
# PM2 itself back up on reboot
pm2 save
pm2 startup           # follow the printed `sudo` command exactly
```

`pm2 startup` prints something like:
```
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:... /opt/homebrew/lib/.../pm2 startup launchd -u <you> --hp /Users/<you>
```
Run that exact line. After it succeeds, `pm2 save` again so the saved process list is the one PM2 restores on next boot.

## Verify

```bash
pm2 status
```
You should see five entries — server `online`, the four cron jobs `stopped` (they're stopped between fires; PM2 still tracks them and respects the cron schedule).

Tail live logs:
```bash
pm2 logs lifecoach-server
pm2 logs lifecoach-sync-todoist --lines 50
pm2 logs lifecoach-daily-reflect --lines 100
```

Health-check the server:
```bash
curl http://localhost:3717/health
# → ok
```

## Common operations

```bash
# Run a cron job RIGHT NOW (skip the schedule)
pm2 restart lifecoach-daily-reflect
pm2 restart lifecoach-sync-todoist

# Pull new code and reload everything in place (no downtime restart for the server)
git pull
pnpm install
pm2 reload ecosystem.config.cjs

# Edit the schedule, then reload
$EDITOR ecosystem.config.cjs
pm2 reload ecosystem.config.cjs

# Stop everything (server + cron jobs)
pm2 stop ecosystem.config.cjs

# Remove from PM2 entirely
pm2 delete ecosystem.config.cjs
pm2 save
```

## Why `sh -c` and not `zsh -lc`

Every entry runs `/bin/sh -c 'pnpm …'`. Earlier versions used `zsh -lc`, but on macOS systems where Homebrew was installed before Volta, `/etc/zprofile` prepends `/opt/homebrew/bin` to `PATH` — so `zsh -lc` picks up Homebrew's Node (often a newer version) instead of Volta's shim. This defeats the per-project Node pin in `package.json` and can crash native modules built against a different ABI.

`/bin/sh -c` runs in POSIX mode and does not source rc files, so the `PATH` defined in the ecosystem config's `env` block is exactly what the children see. Volta's shims are prepended explicitly in `childPath` at the top of `ecosystem.config.cjs`.

## Environment variables and data isolation

The ecosystem config passes `NODE_ENV: "production"` to every process. The config loader (`packages/core/src/config/index.ts`) picks this up and defaults to `data-production/` as the data directory. If you want to use `data-production/` explicitly regardless of `NODE_ENV`, also set `LIFECOACH_ENV=production` in the `.env` file on the server.

The **log directory** is computed from the same data-dir logic, so logs always co-locate with the database they belong to:
```
/opt/lifecoach/
  data-production/
    lifecoach.db
    raw/
    snapshots/
    logs/
      lifecoach-server.out.log
      lifecoach-server.err.log
      sync-todoist.out.log
      daily-reflect.out.log
      ...
```

## Tuning the Todoist sync schedule

The sync process uses [PM2's `cron_restart`](https://pm2.keymetrics.io/docs/usage/restart-strategies/#cron-restart) field:

```
*/30 * * * *    # every 30 minutes    sync-todoist
0 6 * * *       # 06:00 every day     daily-reflect
30 7 * * *      # 07:30 every day     insights
0 19 * * 0      # 19:00 every Sunday  weekly-reflect
```

To change the Todoist sync frequency, edit `ecosystem.config.cjs` and run `pm2 reload ecosystem.config.cjs`.

To disable Todoist sync entirely, either remove the `lifecoach-sync-todoist` entry from the config, or unset `TODOIST_API_TOKEN` in your `.env` file (the sync command exits silently with no token).

## Troubleshooting

**`pm2 status` shows `lifecoach-server` as `errored`.** Check `pm2 logs lifecoach-server --err`. The most common cause is the DB not existing yet — run `LIFECOACH_ENV=production pnpm lifecoach init` first.

**`lifecoach-sync-todoist` shows `errored` in logs.** Check `pm2 logs lifecoach-sync-todoist`. Common causes: `TODOIST_API_TOKEN` not set in `.env`, or rate limit from Todoist. The sync exits non-zero but PM2 won't restart it (autorestart is off) — it will simply try again at the next 30-minute mark.

**Cron job never fires.** Confirm the schedule on the machine's local time is what you expect (`date`). PM2 won't fire jobs while the Mac is asleep — for unattended runs make sure the Mac is set to *Wake for network access* in System Settings → Energy.

**`pnpm: command not found` in PM2 logs.** The shell isn't finding pnpm via the `childPath` in `ecosystem.config.cjs`. Run `which pnpm` in your terminal and verify the path is covered by `childPath`. Common fix: add `$HOME/Library/pnpm` (macOS) or `$HOME/.local/share/pnpm` (Linux) to the array.

**Server starts but the web UI is blank.** The frontend hasn't been built. Run `pnpm --filter @lifecoach/web build` before starting the server.

**Logs going to the wrong directory.** The log directory is derived from `LIFECOACH_DATA_DIR` or `LIFECOACH_ENV`. If you see logs in an unexpected location, check what those env vars are set to in the process's environment: `pm2 env 0` (or the process index).
