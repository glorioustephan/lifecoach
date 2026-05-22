#!/bin/bash
set -e

# Deploy just the .env file to Mac Mini
# Useful when you only need to update API keys without doing a full snapshot upload

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
SSH_KEY=$(extract_config "sshKeyPath")
USER=$(extract_config "user")

if [ -z "$HOST" ] || [ -z "$REMOTE_DIR" ] || [ -z "$SSH_KEY" ] || [ -z "$USER" ]; then
  echo "Error: Could not read configuration from .deploy.config.js"
  exit 1
fi

if [ ! -f ".env.mac-mini" ]; then
  echo "Error: .env.mac-mini not found"
  echo "Create this file with your production environment variables"
  exit 1
fi

echo "📝 Uploading environment config to $HOST..."
scp -i "$SSH_KEY" ".env.mac-mini" "$USER@$HOST:$REMOTE_DIR/.env" || {
  echo "Error: Failed to upload environment file"
  exit 1
}

echo "✅ Environment updated on Mac Mini"
echo "Server: $HOST"
echo ""
echo "Note: To apply changes, you may need to restart PM2:"
echo "  ssh -i $SSH_KEY $USER@$HOST 'cd $REMOTE_DIR && pm2 restart all'"
