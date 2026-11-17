#!/usr/bin/env bash
# Development: the API (backend/, http://127.0.0.1:8000) and the site (Vite, http://localhost:5173) together,
# the browser opens by itself. Ctrl+C stops both. The first run installs what is missing (node_modules; uv
# makes backend/.venv itself).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "→ npm install"
  npm install
fi

# The backend: uv if it is installed, else the virtualenv made by an earlier `uv sync`.
if command -v uv >/dev/null 2>&1; then
  api=(uv run python -m app --reload)
elif [ -x backend/.venv/bin/python ]; then
  api=(.venv/bin/python -m app --reload)
elif [ -x backend/.venv/Scripts/python.exe ]; then
  api=(.venv/Scripts/python.exe -m app --reload)
else
  echo "Нужен uv: https://docs.astral.sh/uv/ (или backend/.venv после «uv sync»)" >&2
  exit 1
fi

(cd backend && exec "${api[@]}") &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM

echo "→ API: http://127.0.0.1:8000   сайт: http://localhost:5173"
npm run dev -- --open
