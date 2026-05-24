# Cron Job Setup for Life Coach

Life Coach supports automated daily financial sync and periodic reflection generation via cron jobs. This guide shows how to configure your system scheduler.

## Prerequisites

- Life Coach CLI installed and working (`lifecoach --help`)
- `.env` file configured with API keys (ANTHROPIC_API_KEY, MONARCH_SESSION_FILE, etc.)
- Monarch session file authenticated (run `lifecoach sync financial` once manually to create/verify session)

## Daily Financial Sync

Syncs financial data from Monarch Money API at 2 AM every day.

### Linux/macOS (crontab)

```bash
# Edit your crontab
crontab -e

# Add this line (2 AM daily)
0 2 * * * cd /path/to/lifecoach && /path/to/pnpm lifecoach sync financial >> /var/log/lifecoach-sync.log 2>&1
```

### macOS (launchd)

Create `~/Library/LaunchAgents/com.lifecoach.sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifecoach.sync.financial</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>cd /path/to/lifecoach && /path/to/pnpm lifecoach sync financial</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/var/log/lifecoach-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/lifecoach-sync.err</string>
</dict>
</plist>
```

Then enable it:

```bash
launchctl load ~/Library/LaunchAgents/com.lifecoach.sync.financial.plist
launchctl list | grep lifecoach  # Verify it's loaded
```

### Windows (Task Scheduler)

1. Open Task Scheduler
2. Create Basic Task → Name: "Life Coach Financial Sync"
3. Trigger: Daily at 2:00 AM
4. Action: Start a program
   - Program: `pnpm`
   - Arguments: `lifecoach sync financial`
   - Start in: `C:\path\to\lifecoach`
5. Settings: Check "Run whether user is logged in or not"

## Weekly Reflection

Generates a structured weekly reflection every Sunday at 9 AM.

### Linux/macOS (crontab)

```bash
# Edit your crontab
crontab -e

# Add this line (9 AM on Sundays)
0 9 * * 0 cd /path/to/lifecoach && /path/to/pnpm lifecoach reflect weekly >> /var/log/lifecoach-reflect.log 2>&1
```

### macOS (launchd)

Create `~/Library/LaunchAgents/com.lifecoach.reflect.weekly.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lifecoach.reflect.weekly</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>cd /path/to/lifecoach && /path/to/pnpm lifecoach reflect weekly</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
            <key>Weekday</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/var/log/lifecoach-reflect.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/lifecoach-reflect.err</string>
</dict>
</plist>
```

Enable:

```bash
launchctl load ~/Library/LaunchAgents/com.lifecoach.reflect.weekly.plist
```

## Monthly Reflection

Generates a monthly reflection on the first day of the month at 10 AM.

### Linux/macOS (crontab)

```bash
# First day of month at 10 AM
0 10 1 * * cd /path/to/lifecoach && /path/to/pnpm lifecoach reflect monthly >> /var/log/lifecoach-reflect.log 2>&1
```

## Monitoring & Logs

Check sync/reflect logs:

```bash
# Follow sync logs in real-time
tail -f /var/log/lifecoach-sync.log

# Check for errors
tail -f /var/log/lifecoach-sync.err

# View last 50 lines
tail -50 /var/log/lifecoach-sync.log
```

### Crontab Tips

- Always use **absolute paths** (e.g., `/path/to/pnpm` not `pnpm`)
- Redirect both stdout and stderr: `>> file.log 2>&1`
- Test your command manually first before adding to crontab
- Use `*/5 * * * *` for every 5 minutes (development/testing)

### Troubleshooting

**Cron job not running:**

```bash
# Check if crontab is set up
crontab -l

# Check system logs
log stream --predicate 'process == "cron"' --level debug  # macOS
journalctl -u cron --since today                         # Linux
```

**Environment variables not found:**

- Cron runs in a minimal environment; use full paths
- Consider sourcing your `.env` in the cron command:
  ```bash
  0 2 * * * bash -c 'set -a; source /path/to/.env; set +a; cd /path/to/lifecoach && /path/to/pnpm lifecoach sync financial'
  ```

**Permission denied:**

```bash
# Ensure pnpm is executable
which pnpm
chmod +x /path/to/pnpm

# Ensure log directory is writable
touch /var/log/lifecoach-sync.log
chmod 644 /var/log/lifecoach-sync.log
```

## Integration with Capacities

When financial reflections are generated (weekly/monthly), they are automatically pushed to your Capacities daily notes if configured:

- Ensure `CAPACITIES_API_TOKEN` and `CAPACITIES_DEFAULT_SPACE_ID` are set in `.env`
- Financial insights will appear in the weekly note under "Financial Status"

## Performance Notes

- **Daily sync** (2 AM): ~10-30 seconds depending on account count
- **Weekly reflection** (9 AM): ~5-15 seconds (includes financial analysis)
- **Monthly reflection** (10 AM first of month): ~10-20 seconds

Monitor system resources if running on constrained devices.

## Next Steps

1. Test manually: `lifecoach sync financial` and `lifecoach reflect weekly`
2. Set up cron jobs for your OS
3. Monitor logs to verify execution
4. Check Capacities for reflection write-back
