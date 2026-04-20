#!/usr/bin/env bash
# Git Bash: ./dev.sh
# Opens two MinTTY windows when mintty is on PATH (Git for Windows); otherwise runs both servers as background jobs in this terminal.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

if command -v mintty >/dev/null 2>&1; then
  mintty -t "Budget backend (uvicorn)" -e bash -lc "cd \"$ROOT/backend\" && source ../venv/Scripts/activate && python -m uvicorn main:app --reload --port 8000; exec bash -l" &
  mintty -t "Budget web (npm)" -e bash -lc "cd \"$ROOT/web\" && npm run dev; exec bash -l" &
  wait
else
  echo "mintty not found (optional). Starting both in this terminal as background jobs."
  echo "Press Ctrl+C to stop the foreground wait; use jobs/kill to manage processes."
  (
    cd "$ROOT/backend"
    # shellcheck source=/dev/null
    source ../venv/Scripts/activate
    python -m uvicorn main:app --reload --port 8000
  ) &
  (
    cd "$ROOT/web"
    npm run dev --turbopack
  ) &
  wait
fi
