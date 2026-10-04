"""SQLInsight smoke test — v2 (multi-detector + ensemble).

Validates the core pipeline without needing a running server (imports the
detection + database layers directly), then, if a server is reachable on
127.0.0.1:5000, also exercises the live API.

Run:  python tests/smoke_test.py
Exit code 0 = all good.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import detection  # noqa: E402

ATTACKS = [
    "admin' OR '1'='1",
    "admin' OR '1'='1' --",
    "UNION SELECT username,password FROM users--",
    "1' UNION SELECT NULL,NULL--",
    "'; DROP TABLE users; --",
    "' OR pg_sleep(10)--",
    "'; EXEC xp_cmdshell('whoami')--",
    "1 AND extractvalue(1,concat(0x7e,version()))",
]
BENIGN = [
    "john_doe_2024",
    "blue running shoes",
    "best restaurants near me",
    "select a good book",           # English containing 'select'
    "track my order from friday",   # realistic e-commerce search
    "reset my password",
]

passed = failed = 0


def check(name: str, cond: bool) -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}")


# ---- Existing tests (preserved) ----

def test_model_loaded() -> None:
    check("LR model artifacts load", detection.model_loaded())
    # RF is optional at test time but report status
    rf = detection.rf_model_loaded()
    check("RF model artifacts load", rf)


def test_detection_legacy() -> None:
    """Legacy detect() interface still works unchanged."""
    for q in ATTACKS:
        r = detection.detect(q)
        check(f"[legacy] attack detected ({q[:34]})", r["prediction"] == 1)
    for q in BENIGN:
        r = detection.detect(q)
        check(f"[legacy] benign cleared  ({q[:34]})", r["prediction"] == 0)


# ---- New v2 tests ----

def test_detect_multi() -> None:
    """detect_multi() returns new fields."""
    r = detection.detect_multi("admin' OR '1'='1")
    check("detect_multi: action present", "action" in r)
    check("detect_multi: action is BLOCK/ALLOW/REVIEW", r["action"] in ("BLOCK", "ALLOW", "REVIEW"))
    check("detect_multi: detectors list", isinstance(r.get("detectors"), list) and len(r["detectors"]) >= 1)
    check("detect_multi: latency_ms present", isinstance(r.get("latency_ms"), float))
    check("detect_multi: disagreement bool", isinstance(r.get("disagreement"), bool))

    r_benign = detection.detect_multi("select a good book")
    check("detect_multi: benign -> ALLOW", r_benign["action"] == "ALLOW")
    check("detect_multi: benign prediction=0", r_benign["prediction"] == 0)


def test_ensemble() -> None:
    """ensemble.decide() logic."""
    import ensemble
    # All suspicious -> BLOCK
    res = ensemble.decide([
        {"name": "rule", "verdict": "Suspicious", "confidence": 1.0},
        {"name": "lr",   "verdict": "Suspicious", "confidence": 0.99},
    ])
    check("ensemble: all suspicious → BLOCK", res["action"] == "BLOCK")

    # All normal -> ALLOW
    res = ensemble.decide([
        {"name": "rule", "verdict": "Normal", "confidence": 0.0},
        {"name": "lr",   "verdict": "Normal", "confidence": 0.1},
    ])
    check("ensemble: all normal → ALLOW", res["action"] == "ALLOW")

    # Disagree -> REVIEW
    res = ensemble.decide([
        {"name": "rule", "verdict": "Suspicious", "confidence": 1.0},
        {"name": "lr",   "verdict": "Normal",     "confidence": 0.1},
    ])
    check("ensemble: disagreement → REVIEW", res["action"] == "REVIEW")
    check("ensemble: disagreement flag set", res["disagreement"] is True)


def test_database() -> None:
    import database
    database.init_db()

    # Test with v2 fields
    ev = {
        "query": "smoke' OR 1=1--", "prediction": 1, "confidence": 0.99,
        "verdict": "Suspicious", "attack_type": "Tautology / Auth Bypass",
        "source_ip": "203.0.113.7", "method": "GET", "path": "/search",
        "user_agent": "smoke", "country": "US", "region": "x", "city": "y",
        "lat": 1.0, "lon": 2.0, "source": "test", "alerted": 0,
        # v2 fields
        "action": "BLOCK",
        "detection_latency_ms": 4.2,
        "session_id": "smoke-test-session",
        "detectors": [
            {"name": "rule", "verdict": "Suspicious", "confidence": 1.0},
            {"name": "lr",   "verdict": "Suspicious", "confidence": 0.99},
        ],
        "expected_verdict": None,
    }
    eid = database.insert_event(ev)
    check("db insert returns id", isinstance(eid, int) and eid > 0)

    stats = database.get_stats()
    check("db stats has totals", stats["totals"]["requests"] >= 1)
    check("db stats has action_breakdown", "action_breakdown" in stats)
    check("db stats has detector_stats", "detector_stats" in stats)
    check("db recent_events works", len(database.recent_events(limit=5)) >= 1)

    # Test session listing
    sessions = database.list_sessions()
    check("db list_sessions returns list", isinstance(sessions, list))


def test_live_api() -> None:
    try:
        import requests
        base = "http://127.0.0.1:5000"
        h = requests.get(f"{base}/api/health", timeout=2).json()
        check("API /health ok", h.get("status") == "ok")
        check("API /health has rf_model_loaded", "rf_model_loaded" in h)

        r = requests.post(f"{base}/api/scan", json={"query": "admin' OR '1'='1"}, timeout=5).json()
        check("API /scan flags attack", r.get("prediction") == 1)
        check("API /scan has action", r.get("action") in ("BLOCK", "ALLOW", "REVIEW"))
        check("API /scan has detectors[]", isinstance(r.get("detectors"), list))
        check("API /scan has latency_ms", r.get("latency_ms") is not None)

        s = requests.get(f"{base}/api/stats", timeout=3).json()
        check("API /stats has totals", "totals" in s)
        check("API /stats has action_breakdown", "action_breakdown" in s)

        # New endpoints
        det = requests.get(f"{base}/api/detectors", timeout=2).json()
        check("API /detectors returns list", isinstance(det.get("detectors"), list))

        sess = requests.get(f"{base}/api/sessions", timeout=2).json()
        check("API /sessions returns list", isinstance(sess.get("sessions"), list))

        # /api/evaluate
        ev = requests.post(f"{base}/api/evaluate", json={
            "query": "admin' OR '1'='1",
            "expected_verdict": "Suspicious",
            "session_id": "smoke-test-live",
        }, timeout=5).json()
        check("API /evaluate correct field", "correct" in ev)
        check("API /evaluate expected_verdict", ev.get("expected_verdict") == "Suspicious")

    except Exception as exc:
        print(f"  SKIP  live API ({exc}) — start with python backend/app.py to include")


def main() -> None:
    print("SQLInsight smoke test v2 (multi-detector)")
    print("-" * 50)
    test_model_loaded()
    test_detection_legacy()
    test_detect_multi()
    test_ensemble()
    test_database()
    test_live_api()
    print("-" * 50)
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
