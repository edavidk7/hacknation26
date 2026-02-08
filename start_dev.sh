#!/bin/bash

# Start development environment for HackNation

set -e

echo "========================================="
echo "HackNation Development Environment"
echo "========================================="
echo ""

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load environment variables from .env file
if [ -f "$DIR/python-backend/.env" ]; then
    set -a
    source "$DIR/python-backend/.env"
    set +a
else
    echo "⚠️  Warning: .env file not found at python-backend/.env"
    echo "   Create it with: echo 'OPENROUTER_API_KEY=your-key' > python-backend/.env"
    echo ""
fi

# Optional: Set development options
# Uncomment to use mock vibe tree (fast development):
#   export USE_MOCK=true
# Uncomment to set Kimi K2.5 thinking budget (in tokens, lower = faster):
#   export THINKING_BUDGET=1000

# Store PIDs
API_PID=""
UI_PID=""

# Function to handle Ctrl+C
cleanup() {
    echo ""
    echo "========================================="
    echo "Shutting down..."
    echo "========================================="
    
    [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
    [ -n "$UI_PID" ] && kill $UI_PID 2>/dev/null || true
    
    wait 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend API (environment variables are inherited)
echo "Starting API server on http://127.0.0.1:8000"
cd "$DIR/python-backend"
uv run api_server.py &
API_PID=$!

# Wait for API to start
sleep 2

# Start UI
echo "Starting UI on http://localhost:5173"
cd "$DIR/ui"
if [ ! -d "node_modules" ]; then
    echo "Installing UI dependencies..."
    npm install
fi
npm run dev &
UI_PID=$!

echo ""
echo "========================================="
echo "✓ API running: http://127.0.0.1:8000"
echo "✓ UI running: http://localhost:5173"
echo "✓ API docs: http://127.0.0.1:8000/docs"
echo ""
echo "Press Ctrl+C to stop"
echo "========================================="
echo ""

# Wait for all background processes
wait
