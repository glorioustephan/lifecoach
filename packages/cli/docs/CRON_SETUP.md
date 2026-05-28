# Scheduled Jobs Setup

Life Coach uses **PM2** for all scheduled jobs. There is no system cron, launchd, or Windows Task Scheduler involved. Scheduling is defined in `ecosystem.config.cjs` at the repo root and is applied automatically on every production deploy.

## How It Works

The deploy script (`scripts/deploy-production.sh`) runs `pm2 startOrReload ecosystem.config.cjs --update-env` on every push to `main`. This means:

- Adding a new job = add it to `ecosystem.config.cjs` + push to `main`
- Changing a schedule = update the `cron_restart` in `ecosystem.config.cjs` + push to `main`
- No SSH or manual steps needed on the Mac Mini

## Scheduled Processes

| Process | Schedule | Description |
|---|---|---|
| `lifecoach-sync-todoist` | Every 30 min | Mirror Todoist tasks into local DB |
| `lifecoach-sync-financial` | Daily 02:00 | Sync Monarch Money accounts, transactions, holdings |
| `lifecoach-daily-reflect` | Daily 06:00 | Daily reflection |
| `lifecoach-insights` | Daily 07:30 | Insight generation (runs after daily reflection) |
| `lifecoach-artifacts` | Daily 08:00 | Artifact extraction (auto-disables after 5 empty runs) |
| `lifecoach-goal-review` | Sundays 18:00 | Goal progress review before weekly reflection |
| `lifecoach-weekly-reflect` | Sundays 19:00 | Weekly reflection (includes financial section) |
| `lifecoach-monthly-reflect` | 1st of month 10:00 | Monthly reflection (includes financial section) |

## Inspecting Jobs on the Mac Mini

```bash
# See all process statuses and last exit codes
pm2 status

# Follow logs for financial sync
pm2 logs lifecoach-sync-financial --lines 100

# Follow weekly reflection logs
pm2 logs lifecoach-weekly-reflect --lines 100

# Watch all logs live
pm2 logs
```

## Manually Triggering a Job

```bash
# Force-run financial sync right now (skips wait for next 02:00)
pm2 restart lifecoach-sync-financial

# Force-run weekly reflection
pm2 restart lifecoach-weekly-reflect

# Force-run monthly reflection
pm2 restart lifecoach-monthly-reflect
```

## Prerequisites on the Mac Mini

The Mac Mini `.env` (or `.env.production`) must contain Monarch credentials:

```bash
LIFECOACH_SECRET_KEY=<long-random-secret>
MONARCH_SESSION_FILE=.mm/mm_session.json
```

The Monarch session file is created once by running `lifecoach auth monarch` on the Mac Mini directly. It persists across deploys (it lives in the working directory, not in the repo).

## Adding a New Scheduled Job

Edit `ecosystem.config.cjs` to add a new entry to the `apps` array:

```js
{
  name: "lifecoach-my-new-job",
  script: "/bin/sh",
  args: ["-c", "pnpm -w run lifecoach <command>"],
  ...base("my-new-job"),
  autorestart: false,
  cron_restart: "0 3 * * *",  // Daily at 03:00
  max_memory_restart: "512M",
},
```

Push to `main` — the deploy pipeline picks it up automatically.
