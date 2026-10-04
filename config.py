"""Central configuration for SQLInsight.

All settings are read from environment variables (loaded from .env if present),
with safe defaults so the project runs out-of-the-box after `pip install`.
"""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # python-dotenv missing -> rely on real env vars
    pass

# ---- Paths ----
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ML_DIR = BASE_DIR / "ml"
ARTIFACTS_DIR = ML_DIR / "artifacts"
LOGS_DIR = BASE_DIR / "logs"
RUNTIME_DIR = BASE_DIR / "runtime"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

for _d in (LOGS_DIR, RUNTIME_DIR, ARTIFACTS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---- ML artifacts ----
MODEL_PATH = ARTIFACTS_DIR / "ML_model.pkl"
RF_MODEL_PATH = ARTIFACTS_DIR / "RF_model.pkl"
VECTORIZER_PATH = ARTIFACTS_DIR / "vectorizer.joblib"
METRICS_PATH = ARTIFACTS_DIR / "metrics.json"

# ---- Datasets (Modified = experiment 1 / train ; clean = experiment 2 / eval) ----
TRAIN_DATASET = DATA_DIR / "Modified_SQL_Dataset.csv"
EVAL_DATASET = DATA_DIR / "clean_sql_dataset.csv"

# ---- Database & logs ----
DB_PATH = RUNTIME_DIR / "sqlinsight.db"
ACCESS_LOG_PATH = Path(os.getenv("ACCESS_LOG_PATH", str(LOGS_DIR / "access.log")))
if not ACCESS_LOG_PATH.is_absolute():
    ACCESS_LOG_PATH = BASE_DIR / ACCESS_LOG_PATH
COLLECTED_PAYLOADS_PATH = LOGS_DIR / "collected_payloads.jsonl"

# ---- Web server ----
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "5000"))
SECRET = os.getenv("SQLINSIGHT_SECRET", "dev-secret")

# ---- Email alerts ----
ALERTS_ENABLED = os.getenv("ALERTS_ENABLED", "false").lower() in ("1", "true", "yes")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
# Gmail app passwords are shown with spaces for readability; strip them.
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")
ALERT_FROM = os.getenv("ALERT_FROM", SMTP_USER)
ALERT_TO = os.getenv("ALERT_TO", SMTP_USER)
ALERT_COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "60"))

# ---- Geolocation ----
IPINFO_TOKEN = os.getenv("IPINFO_TOKEN", "").strip()

VERSION = "2.0.0"

# ---- Detection engine ----
# Threshold for ML detectors (P(malicious) >= DETECTION_THRESHOLD -> Suspicious)
DETECTION_THRESHOLD = float(os.getenv("DETECTION_THRESHOLD", "0.5"))
# Ensemble policy: 'any' (any detector triggers BLOCK) or 'majority'
ENSEMBLE_POLICY = os.getenv("ENSEMBLE_POLICY", "any")
