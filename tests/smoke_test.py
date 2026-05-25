"""SQLInsight smoke test.

Validates the core pipeline without needing a running server (imports the
detection + database layers directly), then, if a server is reachable on
127.0.0.1:5000, also exercises the live API.

Run:  python tests/smoke_test.py
Exit code 0 = all good.
"""
from __future__ import annotations

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
    "select a good book",          # English containing 'select'
    "track my order from friday",  # realistic e-commerce search
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


def test_model_loaded() -> None:
    check("model artifacts load", detection.model_loaded())


def test_detection() -> None:
    for q in ATTACKS:
        r = detection.detect(q)
        check(f"attack detected ({q[:34]})", r["prediction"] == 1)
    for q in BENIGN:
        r = detection.detect(q)
        check(f"benign cleared  ({q[:34]})", r["prediction"] == 0)


def test_database() -> None:
    import database
    database.init_db()
    ev = {
        "query": "smoke' OR 1=1--", "prediction": 1, "confidence": 0.99,
        "verdict": "Suspicious", "attack_type": "Tautology / Auth Bypass",
        "source_ip": "203.0.113.7", "method": "GET", "path": "/search",
        "user_agent": "smoke", "country": "US", "region": "x", "city": "y",
        "lat": 1.0, "lon": 2.0, "source": "test", "alerted": 0,
    }
    eid = database.insert_event(ev)
    check("db insert returns id", isinstance(eid, int) and eid > 0)
    stats = database.get_stats()
    check("db stats has totals", stats["totals"]["requests"] >= 1)
    check("db recent_events works", len(database.recent_events(limit=5)) >= 1)


def test_live_api() -> None:
    try:
        import requests
        base = "http://127.0.0.1:5000"
        h = requests.get(f"{base}/api/health", timeout=2).json()
        check("API /health ok", h.get("status") == "ok")
        r = requests.post(f"{base}/api/scan", json={"query": "admin' OR '1'='1"}, timeout=5).json()
        check("API /scan flags attack", r.get("prediction") == 1)
        s = requests.get(f"{base}/api/stats", timeout=3).json()
        check("API /stats has totals", "totals" in s)
    except Exception:
        print("  SKIP  live API (server not running) — start it with ./run.sh to include")


def main() -> None:
    print("SQLInsight smoke test")
    print("-" * 40)
    test_model_loaded()
    test_detection()
    test_database()
    test_live_api()
    print("-" * 40)
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
