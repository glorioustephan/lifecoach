#!/bin/bash
set -e

# Deploy lifecoach to Mac Mini
# Exports local data as snapshot, uploads it to the server, imports it, then restarts PM2

CONFIG_FILE=".deploy.config.js"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: $CONFIG_FILE not found"
  echo "Copy from .deploy.config.example.js and update with your Mac Mini details"
  exit 1
fi

# Extract config values using Node.js
extract_config() {
  node -e "const cfg = require('./.deploy.config.js'); console.log(cfg.$1)" 2>/dev/null
}

HOST=$(extract_config "host")
REMOTE_DIR=$(extract_config "remoteDir")
STRATEGY=$(extract_config "strategy")
SSH_KEY=$(extract_config "sshKeyPath")
USER=$(extract_config "user")

if [ -z "$HOST" ] || [ -z "$REMOTE_DIR" ] || [ -z "$SSH_KEY" ] || [ -z "$USER" ]; then
  echo "Error: Could not read configuration from .deploy.config.js"
  exit 1
fi

echo "🚀 Deploying lifecoach to $HOST..."

if [ "$STRATEGY" = "snapshot" ]; then
  echo "📦 Creating snapshot..."
  pnpm lifecoach export

  # Find the most recent snapshot across all possible data directories.
  # loadEnvironmentConfig() picks data-{LIFECOACH_ENV} or data-{NODE_ENV};
  # also check the legacy data/ directory for backwards compatibility.
  SNAPSHOT=$(ls -t data-*/snapshots/*.tar.gz data/snapshots/*.tar.gz 2>/dev/null | head -1)
  if [ -z "$SNAPSHOT" ]; then
    echo "Error: Could not find a snapshot file in data-*/snapshots/ or data/snapshots/"
    echo "Tip: run 'pnpm lifecoach export' first, or check your LIFECOACH_ENV setting"
    exit 1
  fi
  echo "Using snapshot: $SNAPSHOT"

  echo "📤 Uploading snapshot to $HOST..."
  scp -i "$SSH_KEY" "$SNAPSHOT" "$USER@$HOST:$REMOTE_DIR/" || {
    echo "Error: Failed to upload snapshot"
    exit 1
  }
  echo "✅ Snapshot uploaded"

  echo "⏳ Importing snapshot on server..."
  SNAPSHOT_NAME=$(basename "$SNAPSHOT")
  ssh -i "$SSH_KEY" "$USER@$HOST" "cd $REMOTE_DIR && pnpm lifecoach import $SNAPSHOT_NAME && rm $SNAPSHOT_NAME" || {
    echo "Error: Failed to import snapshot on server"
    exit 1
  }
  echo "✅ Snapshot imported"
else
  echo "Error: Unsupported deployment strategy: $STRATEGY"
  exit 1
fi

echo "🔄 Restarting PM2 processes..."
ssh -i "$SSH_KEY" "$USER@$HOST" "cd $REMOTE_DIR && pm2 restart all && pm2 save" || {
  echo "Error: Failed to restart PM2 on server"
  exit 1
}

echo "✅ Deployment complete!"
echo "Server: $HOST"
echo "Data dir: $REMOTE_DIR"
