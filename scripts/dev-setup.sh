#!/bin/bash
set -e

# One-time development environment setup
# Creates .env.local and data-dev directory if they don't exist

echo "🔧 Setting up lifecoach development environment..."

if [ ! -f ".env.local" ]; then
  echo "📝 Creating .env.local..."
  cat > .env.local << 'EOF'
LIFECOACH_ENV=development
ANTHROPIC_API_KEY=your-dev-api-key
VOYAGE_API_KEY=your-dev-voyage-key
TODOIST_API_TOKEN=your-dev-todoist-token
CAPACITIES_API_TOKEN=your-dev-capacities-token
LIFECOACH_AUTH=off
NODE_ENV=development
PORT=3717
EOF
  echo "✅ Created .env.local — update with your dev API keys"
else
  echo "ℹ️  .env.local already exists"
fi

if [ ! -d "data-dev" ]; then
  echo "📁 Creating data-dev directory..."
  mkdir -p data-dev
  echo "✅ Created data-dev directory"
else
  echo "ℹ️  data-dev directory already exists"
fi

echo "✅ Dev environment ready!"
echo ""
echo "Next steps:"
echo "  1. Update .env.local with your API keys"
echo "  2. Run: pnpm dev"
