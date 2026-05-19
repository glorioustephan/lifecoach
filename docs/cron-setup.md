# Background-intelligence cron (macOS launchd)

This sets up the Mac Mini to run Lifecoach's background loops without you needing to do anything. After install, the system will:

| Schedule | Job | What it does |
|---|---|---|
| **06:00 daily** | `com.lifecoach.daily-reflect` | `lifecoach reflect daily` — synthesizes yesterday |
| **07:30 daily** | `com.lifecoach.insights` | `lifecoach insights generate` — surfaces patterns into the Inbox (runs AFTER the daily reflection so it can use it) |
| **19:00 Sunday** | `com.lifecoach.weekly-reflect` | `lifecoach reflect weekly` — synthesizes the week |

Open the Inbox in the morning, and the briefing panel + any fresh insights are already there.

## Install

From the repo root:

```bash
./scripts/launchd/install.sh
```

What it does:
- Substitutes your repo path + your `pnpm` location into each `.plist` template
- Drops them into `~/Library/LaunchAgents/`
- Loads them with `launchctl`
- Creates `data/logs/` for stdout/stderr per job

Idempotent — running it again replaces the existing entries.

## Verify

```bash
# All three jobs should appear
launchctl list | grep lifecoach

# Trigger the daily reflection right now (don't wait until 6am)
launchctl start com.lifecoach.daily-reflect

# Tail the log
tail -f data/logs/daily-reflect.out.log
```

## Tune the times

Edit any of the plists in `scripts/launchd/` (they're templates — substitute happens at install time), or edit the installed copies directly in `~/Library/LaunchAgents/com.lifecoach.*.plist` and run:

```bash
launchctl unload ~/Library/LaunchAgents/com.lifecoach.daily-reflect.plist
launchctl load   ~/Library/LaunchAgents/com.lifecoach.daily-reflect.plist
```

The `StartCalendarInterval` block accepts `Hour`, `Minute`, `Weekday` (0 = Sunday), `Day`, and `Month` keys.

## Uninstall

```bash
./scripts/launchd/uninstall.sh
```

Unloads all three jobs and removes the plist copies. Doesn't touch your data.

## Troubleshooting

**Job appears in `launchctl list` but never runs.** Check the log files in `data/logs/`. Common causes:
- `pnpm` not on the launchd $PATH — the install script substitutes the absolute path of pnpm, but if you reinstall pnpm to a different location you'll need to rerun the installer.
- `.env` file not in the repo root — the CLI looks for it via `findWorkspaceRoot()`, which needs `pnpm-workspace.yaml` or `.git` to anchor.
- macOS hasn't been awake at the scheduled time — launchd jobs with `StartCalendarInterval` only fire if the Mac is awake. For unattended deploys make sure the Mac mini's "wake for network access" is on.

**Job runs but the reflection is empty / weird.** Look at `data/logs/<job>.out.log` to see what the agent emitted. If `ANTHROPIC_API_KEY` isn't being loaded, you'll see "ANTHROPIC_API_KEY is not set" — the launchd job runs with a minimal environment and reads `.env` from the workspace root.

**Want the server itself to run as a service too** (so the web UI is always reachable on the tailnet, not just when you happen to have `pnpm start` running)? That's a different plist with `KeepAlive` set to `true` — drop me a request for `com.lifecoach.server.plist` and we'll add it.
