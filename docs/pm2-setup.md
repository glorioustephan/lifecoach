# Running Lifecoach with PM2

[PM2](https://pm2.keymetrics.io/) supervises the long-running server **and** the scheduled background-intelligence jobs (daily reflection, daily insight pass, weekly reflection) from one config file: `ecosystem.config.cjs` at the repo root.

If you already use PM2 for other services, Lifecoach slots in next to them — no separate launchd setup, no system-level cron entries.

## What gets supervised

| Process | Schedule | What it does |
|---|---|---|
| `lifecoach-server` | always running, auto-restart on crash | the Hono HTTP+API server (default port 3717) |
| `lifecoach-daily-reflect` | 06:00 daily | `lifecoach reflect daily` |
| `lifecoach-insights` | 07:30 daily | `lifecoach insights generate` (after the morning reflection so it has fresh context) |
| `lifecoach-weekly-reflect` | 19:00 Sunday | `lifecoach reflect weekly` |

Logs land in `data/logs/<name>.{out,err}.log` (the directory is created on first run; gitignored).

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
You should see four entries — server `online`, the three cron jobs `stopped` (they're stopped between fires; PM2 still tracks them and respects the cron schedule).

Tail live logs:
```bash
pm2 logs lifecoach-server
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

## Why `zsh -lc` in the config

Every entry runs `/bin/zsh -lc 'pnpm …'`. PM2's spawn environment is otherwise minimal — `zsh -lc` triggers your shell rc files so `pnpm`, `node`, and `corepack` resolve the same way as in your interactive terminal. This avoids the classic "pnpm: command not found" failure when `pm2 startup` runs PM2 under launchd with a slim `$PATH`.

## Tuning the schedule

The three cron-style jobs use [PM2's `cron_restart`](https://pm2.keymetrics.io/docs/usage/restart-strategies/#cron-restart) field with standard 5-field cron expressions in **local time**:

```
0 6 * * *     # 06:00 every day        daily-reflect
30 7 * * *    # 07:30 every day        insights
0 19 * * 0    # 19:00 every Sunday     weekly-reflect
```

Edit `ecosystem.config.cjs`, then `pm2 reload ecosystem.config.cjs`.

## Troubleshooting

**`pm2 status` shows `lifecoach-server` as `errored`.** Check `pm2 logs lifecoach-server --err`. The most common cause is the `data/lifecoach.db` not existing yet — run `pnpm lifecoach init` first.

**Cron job never fires.** Confirm the schedule on the machine's local time is what you expect (`date`). PM2 won't fire jobs while the Mac is asleep — for unattended runs make sure the Mac is set to *Wake for network access* in System Settings → Energy.

**`pnpm: command not found` in PM2 logs.** Your shell rc file isn't being sourced. Run `/bin/zsh -lc 'which pnpm'` from your terminal to confirm pnpm is on the rc-sourced PATH. If not, install via `brew install pnpm` or via `corepack enable && corepack prepare pnpm@11.1.0 --activate`.

**Server starts but the web UI is blank.** The frontend hasn't been built. Run `pnpm --filter @lifecoach/web build` before starting the server.
