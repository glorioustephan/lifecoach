#!/bin/bash
set -e

# One-time development environment setup
# Creates .env.development and data-development directory if they don't exist

echo "🔧 Setting up lifecoach development environment..."

if [ ! -f ".env.development" ]; then
  echo "📝 Creating .env.development..."
  cat > .env.development << 'EOF'
LIFECOACH_ENV=development
ANTHROPIC_API_KEY=your-dev-api-key
VOYAGE_API_KEY=your-dev-voyage-key
TODOIST_API_TOKEN=your-dev-todoist-token
CAPACITIES_API_TOKEN=your-dev-capacities-token
LIFECOACH_AUTH=off
NODE_ENV=development
PORT=3717
EOF
  echo "✅ Created .env.development — update with your dev API keys"
else
  echo "ℹ️  .env.development already exists"
fi

if [ ! -d "data-development" ]; then
  echo "📁 Creating data-development directory..."
  mkdir -p data-development
  echo "✅ Created data-development directory"
else
  echo "ℹ️  data-development directory already exists"
fi

echo "✅ Dev environment ready!"
echo ""
echo "Next steps:"
echo "  1. Update .env.development with your API keys"
echo "  2. Run: pnpm dev"
