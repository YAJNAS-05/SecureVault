#!/usr/bin/env bash
# SQLInsight — start the server (macOS / Linux).
# Runs setup automatically on first use, then serves the API + dashboard.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "==> First run: running setup.sh"
  bash setup.sh
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# Ensure artifacts exist (in case of a partial checkout).
if [ ! -f "ml/artifacts/ML_model.pkl" ]; then
  echo "==> Training model (artifacts missing)"
  python ml/train_model.py
fi

PORT="${PORT:-5000}"
echo ""
echo "==> SQLInsight running at http://127.0.0.1:${PORT}"
echo "    Generate demo traffic in another terminal:  python backend/simulate_traffic.py 60 0.35"
echo "    Press Ctrl+C to stop."
echo ""
exec python backend/app.py
