#!/usr/bin/env bash
# SQLInsight — one-time setup (macOS / Linux).
# Creates a virtualenv, installs deps, prepares .env, and ensures the model +
# dashboard are ready. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> SQLInsight setup"

# 1. Python check
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found. Install Python 3.12+ (e.g. 'brew install python')." >&2
  exit 1
fi
echo "    python3: $(python3 --version)"

# 2. Virtualenv
if [ ! -d ".venv" ]; then
  echo "==> Creating virtualenv (.venv)"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

# 3. Dependencies
echo "==> Installing Python dependencies"
python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt

# 4. .env
if [ ! -f ".env" ]; then
  echo "==> Creating .env from .env.example (edit it to enable email alerts)"
  cp .env.example .env
fi

# 5. Model artifacts (pre-trained & committed; retrain only if missing)
if [ ! -f "ml/artifacts/ML_model.pkl" ] || [ ! -f "ml/artifacts/vectorizer.joblib" ]; then
  echo "==> Model artifacts missing — training now (one-time, ~1 min)"
  python ml/train_model.py
else
  echo "    model artifacts present — skipping training"
fi

# 6. Frontend build (pre-built & committed; rebuild only if missing AND npm exists)
if [ ! -f "frontend/dist/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "==> frontend/dist missing — building dashboard"
    ( cd frontend && npm install && npm run build )
  else
    echo "WARN: frontend/dist not found and npm not installed; the API will work but the dashboard UI won't."
  fi
else
  echo "    dashboard build present — skipping"
fi

echo ""
echo "==> Setup complete. Start the app with:  ./run.sh"
