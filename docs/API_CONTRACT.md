# SQLInsight — API Contract v2

> **For SecureBank (Developer 1) and Red-Team Agent (Developer 1)**
> SQLInsight runs as an independent HTTP service on `http://localhost:5000`.
> No shared code, no shared database. Integration is a single HTTP call.

---

## Quick Start

```bash
# 1. Start the detection engine
python backend/app.py

# 2. Health check
curl http://localhost:5000/api/health
```

---

## Endpoints

### `GET /api/health`

Returns service status and model availability.

```json
{
  "status": "ok",
  "version": "2.0.0",
  "model_loaded": true,
  "rf_model_loaded": true,
  "alerts_enabled": false,
  "ensemble_policy": "any"
}
```

---

### `POST /api/scan` ← Primary integration endpoint

Scan a single input string for SQL injection.

**Request:**
```json
{
  "query": "' OR 1=1 --",
  "source_ip": "192.168.1.10",
  "source": "securebank",
  "endpoint": "/login",
  "session_id": "optional-session-id",
  "method": "POST",
  "user_agent": "Mozilla/5.0 ..."
}
```

| Field | Required | Description |
|---|---|---|
| `query` | YES | The input to inspect (form field value, query string, etc.) |
| `source_ip` | no | Originating IP (for geo and alerting) |
| `source` | no | Tag: `"securebank"`, `"redteam"`, `"scanner"` (default) |
| `endpoint` | no | The SecureBank URL path this came from (e.g., `/login`) |
| `session_id` | no | Group requests into a named session |
| `method` | no | HTTP method for access log (default `GET`) |
| `user_agent` | no | User-agent string for logging |

**Response:**
```json
{
  "id": 42,
  "query": "' OR 1=1 --",
  "action": "BLOCK",
  "verdict": "Suspicious",
  "prediction": 1,
  "confidence": 0.9973,
  "attack_type": "Tautology / Auth Bypass",
  "disagreement": false,
  "latency_ms": 4.2,
  "detectors": [
    {"name": "rule", "verdict": "Suspicious", "confidence": 1.0, "matched_rule": "Tautology / Auth Bypass"},
    {"name": "lr",   "verdict": "Suspicious", "confidence": 0.9987},
    {"name": "rf",   "verdict": "Suspicious", "confidence": 0.9951}
  ],
  "source_ip": "192.168.1.10",
  "country": "IN",
  "ts": "2026-10-03T17:00:00Z",
  "session_id": null,
  "alerted": 0
}
```

**`action` field — use this for SecureBank policy:**

| Value | Meaning | Recommended SecureBank response |
|---|---|---|
| `BLOCK` | All or majority of detectors flagged the input | Reject the request. Return 403 or form error to user. |
| `ALLOW` | All detectors cleared the input | Proceed normally. |
| `REVIEW` | Detectors disagreed | Log and proceed, or block — SecureBank's policy decision. |

---

### `POST /api/evaluate` — Red-Team Agent endpoint

Same as `/api/scan` but accepts a ground-truth label so session evaluation metrics can be computed.

**Request:**
```json
{
  "query": "1' UNION SELECT null,null,null --",
  "expected_verdict": "Suspicious",
  "session_id": "redteam-session-001",
  "source_ip": "10.0.0.1",
  "source": "redteam"
}
```

| Field | Required | Description |
|---|---|---|
| `query` | YES | Payload to inspect |
| `expected_verdict` | YES | `"Suspicious"` or `"Normal"` |
| `session_id` | YES | Group for metrics computation |

**Response:** Same shape as `/api/scan` plus:
```json
{
  "correct": true,
  "expected_verdict": "Suspicious"
}
```

---

### `GET /api/sessions`

List all sessions.

```json
{
  "sessions": [
    {
      "session_id": "redteam-session-001",
      "total": 50,
      "attacks": 42,
      "labeled": 50,
      "started": "2026-10-03T17:00:00Z",
      "last_seen": "2026-10-03T17:10:00Z"
    }
  ]
}
```

---

### `GET /api/sessions/<session_id>`

Per-session evaluation metrics (requires labeled events from `/api/evaluate`).

```json
{
  "session_id": "redteam-session-001",
  "labeled_events": 50,
  "ensemble": {
    "tp": 40, "fp": 1, "fn": 2, "tn": 7,
    "precision": 97.56, "recall": 95.24, "f1": 96.39, "accuracy": 94.0
  },
  "detectors": {
    "rule": { "tp": 38, "fp": 0, "fn": 4, "tn": 8, "precision": 100.0, "recall": 90.48, "f1": 95.0, "accuracy": 92.0 },
    "lr":   { "tp": 39, "fp": 1, "fn": 3, "tn": 7, "precision": 97.5, "recall": 92.86, "f1": 95.12, "accuracy": 92.0 },
    "rf":   { "tp": 40, "fp": 1, "fn": 2, "tn": 7, "precision": 97.56, "recall": 95.24, "f1": 96.39, "accuracy": 94.0 }
  },
  "missed_attacks_count": 2,
  "missed_attacks_sample": [{"action": "ALLOW", "expected": "Suspicious"}]
}
```

---

### `GET /api/stats`

Extended aggregated stats. Key v2 additions:
- `action_breakdown: { BLOCK, ALLOW, REVIEW }` — action distribution
- `detector_stats: { rule, lr, rf }` — per-detector totals
- `latency: { p50, p95, p99, avg, samples }` — detection latency percentiles

---

### `GET /api/events`

Recent events with optional filters.

```
GET /api/events?limit=50&verdict=Suspicious&session_id=abc&action=BLOCK
```

---

### `GET /api/detectors`

Metadata about all active detectors.

```json
{
  "detectors": [
    { "name": "rule", "type": "regex", "loaded": true, "speed_ms_approx": 0.1 },
    { "name": "lr",   "type": "ml:LogisticRegression", "loaded": true, "speed_ms_approx": 2.0 },
    { "name": "rf",   "type": "ml:RandomForestClassifier", "loaded": true, "speed_ms_approx": 5.0 }
  ],
  "ensemble_policy": "any"
}
```

---

## SecureBank Integration Example (Python)

```python
import requests

SQLINSIGHT_URL = "http://localhost:5000"

def check_input(user_input: str, user_ip: str, endpoint: str, session_id: str = None) -> dict:
    resp = requests.post(f"{SQLINSIGHT_URL}/api/scan", json={
        "query": user_input,
        "source_ip": user_ip,
        "source": "securebank",
        "endpoint": endpoint,
        "session_id": session_id,
    }, timeout=2)
    resp.raise_for_status()
    return resp.json()

# In your login view:
result = check_input(request.form["username"], request.remote_addr, "/login")
if result["action"] == "BLOCK":
    return "Request blocked for security reasons.", 403
# else: proceed with login
```

---

## Red-Team Agent Integration Example (Python)

```python
import requests

SQLINSIGHT_URL = "http://localhost:5000"
SESSION_ID = "redteam-session-001"

PAYLOADS = [
    ("' OR '1'='1", "Suspicious"),
    ("john_doe", "Normal"),
    ("1' UNION SELECT null,table_name FROM information_schema.tables--", "Suspicious"),
]

for payload, expected in PAYLOADS:
    resp = requests.post(f"{SQLINSIGHT_URL}/api/evaluate", json={
        "query": payload,
        "expected_verdict": expected,
        "session_id": SESSION_ID,
        "source": "redteam",
    })
    result = resp.json()
    print(f"[{'OK' if result['correct'] else 'MISS'}] {payload[:40]:<40}  action={result['action']}")

# Get session evaluation metrics
metrics = requests.get(f"{SQLINSIGHT_URL}/api/sessions/{SESSION_ID}").json()
print(f"Ensemble F1: {metrics['ensemble']['f1']:.2f}%")
print(f"Missed attacks (FN): {metrics['missed_attacks_count']}")
```

---

## Network Topology

```
SecureBank (port 8000)  --[POST /api/scan]-------> SQLInsight (port 5000)
Red-Team Agent          --[POST /api/evaluate]--> SQLInsight (port 5000)
Browser Dashboard       --[GET /]---------------> SQLInsight (port 5000) [serves React SPA]
```

Both services run locally during development. No external network access required.
