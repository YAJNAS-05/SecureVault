# SQLInsight v2 — Architecture

## Overview

SQLInsight is a **production-grade SQL Injection Detection and Defense Engine** designed as an **independent, reusable security component** for integration with banking applications.

It runs as a standalone HTTP service (Flask, port 5000) and accepts arbitrary query strings via a clean REST API, returning structured security decisions (BLOCK / ALLOW / REVIEW).

---

## System Architecture

```
SecureBank (Developer 1)          Red-Team Agent (Developer 1)
     |                                      |
     | POST /api/scan                       | POST /api/evaluate
     v                                      v
+-----------------------------------------------------------+
|            Detection & Defense Engine  (v2.0.0)           |
|                    backend/app.py                          |
|                                                           |
|  [RuleDetector]   [LRDetector]    [RFDetector]            |
|  9 regex rules    LR existing     RF new                  |
|  ~0.1ms           ~2ms            ~5ms                    |
|       |               |               |                   |
|       +---------------+---------------+                   |
|                       |                                   |
|          [Ensemble Decision Layer]                        |
|          backend/ensemble.py                              |
|          -> action: BLOCK | ALLOW | REVIEW                |
|                                                           |
|  [Event Storage: SQLite  runtime/sqlinsight.db]           |
|  events + action + detectors_json + latency + session_id  |
|                                                           |
|  POST /api/scan     POST /api/evaluate                    |
|  GET  /api/events   GET  /api/stats                       |
|  GET  /api/detectors GET /api/sessions/<id>               |
|  GET  /api/health   GET  /api/model                       |
+-----------------------------------------------------------+
                           |
             [React Dashboard  frontend/dist/]
             - KPI cards (requests / attacks / rate / accuracy)
             - Threat timeline (24h hourly)
             - Attack types distribution
             - Sources and geo map
             - Action Breakdown (BLOCK/ALLOW/REVIEW) [NEW]
             - Detector Comparison (LR vs RF vs Rule) [NEW]
             - Live Detection Feed (with action badges) [EXTENDED]
             - Session Evaluation (Red-Team results)   [NEW]
             - Model Performance (LR + RF side-by-side) [EXTENDED]
```

---

## Component Inventory

### Backend

| File | Role | Status |
|---|---|---|
| `backend/app.py` | Flask API, all endpoints | Extended v2 |
| `backend/detection.py` | Multi-detector orchestrator | Refactored v2 |
| `backend/ensemble.py` | BLOCK/ALLOW/REVIEW decision | NEW |
| `backend/database.py` | SQLite + session eval + extended stats | Extended v2 |
| `backend/accesslog.py` | Apache-style log writer | Unchanged |
| `backend/geoip.py` | IP geolocation | Unchanged |
| `backend/alerts.py` | Email alerting | Unchanged |
| `backend/monitor.py` | Log-tail monitor | Unchanged |

### ML

| File | Role | Status |
|---|---|---|
| `ml/train_model.py` | Trains LR + RF on same vectorizer | Extended v2 |
| `ml/preprocess.py` | Shared feature pipeline | Unchanged |
| `ml/evaluate_session.py` | Offline session evaluation CLI | NEW |
| `ml/artifacts/ML_model.pkl` | LogisticRegression (deployed) | Existing |
| `ml/artifacts/RF_model.pkl` | RandomForestClassifier | NEW |
| `ml/artifacts/vectorizer.joblib` | Shared feature vectorizer | Existing |
| `ml/artifacts/metrics.json` | LR + RF metrics | Extended |

### Frontend

| File | Role | Status |
|---|---|---|
| `frontend/src/App.tsx` | Root app with polling hooks | Extended v2 |
| `frontend/src/types.ts` | API type definitions | Extended v2 |
| `frontend/src/lib/api.ts` | Fetch wrappers | Extended v2 |
| `frontend/src/components/DetectorComparison.tsx` | LR vs RF vs Rule panel | NEW |
| `frontend/src/components/ActionBreakdown.tsx` | BLOCK/ALLOW/REVIEW chart | NEW |
| `frontend/src/components/SessionEvaluation.tsx` | Red-Team session metrics | NEW |
| `frontend/src/components/LiveFeed.tsx` | Feed with action badges | Extended |
| `frontend/src/components/ModelPerformance.tsx` | LR + RF metrics | Extended |
| `frontend/dist/` | Pre-built production bundle | Rebuilt |

---

## Detectors

| Name | Type | Speed | Exp 1 Recall | Exp 2 Unseen Recall |
|---|---|---|---|---|
| `rule` | Regex (9 patterns) | 0.1 ms | 100% canonical | High on known patterns |
| `lr` | LogisticRegression | 2 ms | 99.25% | 84.25% |
| `rf` | RandomForestClassifier | 5 ms | 99.38% | **93.95%** |

---

## Ensemble Logic

```
policy = 'any'   (default, banking = fail-closed)
  - ALL detectors Normal   -> ALLOW
  - ANY votes Suspicious, all agree -> BLOCK
  - Detectors disagree     -> REVIEW  (surface conflict)

policy = 'majority'  (alternative)
  - >50% Suspicious -> BLOCK
```

---

## Model Performance Summary

| Model | Exp 1 Accuracy | Exp 1 Recall | Exp 2 Unseen Recall |
|---|---|---|---|
| LogisticRegression | 99.69% | 99.25% | 84.25% |
| RandomForestClassifier | 99.68% | 99.38% | **93.95%** |

RF closes the 16% false-negative gap on unseen data by ~10 percentage points.

---

## Integration

### SecureBank

```python
import requests
result = requests.post("http://localhost:5000/api/scan", json={
    "query": user_input,
    "source": "securebank",
    "endpoint": "/login",
}).json()

if result["action"] == "BLOCK":
    return "Blocked", 403
```

### Red-Team Agent

```python
result = requests.post("http://localhost:5000/api/evaluate", json={
    "query": payload,
    "expected_verdict": "Suspicious",
    "session_id": "run-001",
}).json()

metrics = requests.get("http://localhost:5000/api/sessions/run-001").json()
print(metrics["ensemble"]["recall"])   # per-session recall
```

Full contract: [`docs/API_CONTRACT.md`](API_CONTRACT.md)

---

## Running

```bat
run.bat
```

Dashboard: `http://localhost:5000`

Smoke test: `.venv\Scripts\python.exe -X utf8 tests\smoke_test.py`
Expected result: **45 passed, 0 failed**
