"""SQLite event store for SQLInsight.

A single ``events`` table records every inspected request. Both the live API
(backend/app.py) and the standalone log monitor (backend/monitor.py) write here,
and the dashboard reads aggregated stats from it.

Schema extensions (migration-safe, additive):
  action              TEXT  DEFAULT 'ALLOW'      -- BLOCK|ALLOW|REVIEW
  detection_latency_ms REAL                      -- end-to-end detection time
  session_id          TEXT                       -- Red-Team or SecureBank session
  detectors_json      TEXT                       -- JSON array of per-detector results
  expected_verdict    TEXT                       -- 'Suspicious'|'Normal' (labeled eval)
"""
from __future__ import annotations

import json
import sqlite3
import sys
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import DB_PATH  # noqa: E402

_local = threading.local()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT    NOT NULL,
    query       TEXT    NOT NULL,
    prediction  INTEGER NOT NULL,
    confidence  REAL    NOT NULL,
    verdict     TEXT    NOT NULL,
    attack_type TEXT,
    source_ip   TEXT,
    method      TEXT,
    path        TEXT,
    user_agent  TEXT,
    country     TEXT,
    region      TEXT,
    city        TEXT,
    lat         REAL,
    lon         REAL,
    source      TEXT,
    alerted     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_pred ON events(prediction);
"""

# Additional columns added in v2 (migration-safe; ALTER TABLE is idempotent via try/except)
_V2_COLUMNS: list[tuple[str, str]] = [
    ("action",               "TEXT DEFAULT 'ALLOW'"),
    ("detection_latency_ms", "REAL"),
    ("session_id",           "TEXT"),
    ("detectors_json",       "TEXT"),
    ("expected_verdict",     "TEXT"),
]

_V2_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_action  ON events(action);
"""


def _conn() -> sqlite3.Connection:
    if getattr(_local, "conn", None) is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.executescript(_SCHEMA)
        _migrate_v2(_local.conn)
    return _local.conn


def _migrate_v2(conn: sqlite3.Connection) -> None:
    """Add v2 columns if they don't already exist (idempotent)."""
    for col_name, col_def in _V2_COLUMNS:
        try:
            conn.execute(f"ALTER TABLE events ADD COLUMN {col_name} {col_def}")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
    conn.executescript(_V2_INDEXES)
    conn.commit()


def init_db() -> None:
    _conn().executescript(_SCHEMA)
    _migrate_v2(_conn())


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def insert_event(event: dict) -> int:
    fields = [
        "ts", "query", "prediction", "confidence", "verdict", "attack_type",
        "source_ip", "method", "path", "user_agent", "country", "region",
        "city", "lat", "lon", "source", "alerted",
        # v2 fields
        "action", "detection_latency_ms", "session_id", "detectors_json", "expected_verdict",
    ]
    event.setdefault("ts", _now())
    # Serialise detectors list -> JSON string
    detectors = event.get("detectors_json") or event.get("detectors")
    if isinstance(detectors, list):
        event["detectors_json"] = json.dumps(detectors)
    values = [event.get(f) for f in fields]
    cur = _conn().execute(
        f"INSERT INTO events ({','.join(fields)}) VALUES ({','.join(['?'] * len(fields))})",
        values,
    )
    _conn().commit()
    return int(cur.lastrowid)


def recent_events(
    limit: int = 50,
    verdict: str | None = None,
    session_id: str | None = None,
    action: str | None = None,
) -> list[dict]:
    sql = "SELECT * FROM events"
    params: list = []
    conditions = []
    if verdict in ("Suspicious", "Normal"):
        conditions.append("verdict = ?")
        params.append(verdict)
    if session_id:
        conditions.append("session_id = ?")
        params.append(session_id)
    if action in ("BLOCK", "ALLOW", "REVIEW"):
        conditions.append("action = ?")
        params.append(action)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(int(limit))
    rows = [dict(r) for r in _conn().execute(sql, params).fetchall()]
    # Deserialise detectors_json back to list
    for row in rows:
        dj = row.get("detectors_json")
        if dj:
            try:
                row["detectors"] = json.loads(dj)
            except Exception:
                row["detectors"] = []
    return rows


def clear_events() -> int:
    """Delete all events and reset the auto-increment counter. Returns rows removed."""
    cur = _conn().execute("DELETE FROM events")
    try:
        _conn().execute("DELETE FROM sqlite_sequence WHERE name='events'")
    except sqlite3.OperationalError:
        pass  # sqlite_sequence may not exist yet
    _conn().commit()
    return cur.rowcount


# --------------------------------------------------------------------------- #
# Session evaluation                                                            #
# --------------------------------------------------------------------------- #

def get_session(session_id: str) -> dict:
    """Return per-detector TP/FP/FN/TN metrics for a labeled Red-Team session."""
    c = _conn()
    rows = c.execute(
        "SELECT verdict, action, expected_verdict, detectors_json "
        "FROM events WHERE session_id = ? AND expected_verdict IS NOT NULL",
        (session_id,),
    ).fetchall()

    if not rows:
        return {"session_id": session_id, "labeled_events": 0, "detectors": {}, "ensemble": {}}

    # Per-detector stats
    detector_stats: dict[str, dict] = {}
    ensemble_tp = ensemble_fp = ensemble_fn = ensemble_tn = 0

    missed_attacks: list[dict] = []

    for row in rows:
        expected = row["expected_verdict"]  # 'Suspicious' | 'Normal'
        action = row["action"] or "ALLOW"
        actual_verdict = row["verdict"]

        # Ensemble confusion
        predicted_attack = actual_verdict == "Suspicious"
        is_attack = expected == "Suspicious"
        if predicted_attack and is_attack:
            ensemble_tp += 1
        elif predicted_attack and not is_attack:
            ensemble_fp += 1
        elif not predicted_attack and is_attack:
            ensemble_fn += 1
            # Track missed attacks for research analysis
            missed_attacks.append({"action": action, "expected": expected})
        else:
            ensemble_tn += 1

        # Per-detector breakdown
        try:
            detectors = json.loads(row["detectors_json"] or "[]")
        except Exception:
            detectors = []

        for d in detectors:
            name = d.get("name", "unknown")
            if name not in detector_stats:
                detector_stats[name] = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
            det_pred = d.get("verdict") == "Suspicious"
            if det_pred and is_attack:
                detector_stats[name]["tp"] += 1
            elif det_pred and not is_attack:
                detector_stats[name]["fp"] += 1
            elif not det_pred and is_attack:
                detector_stats[name]["fn"] += 1
            else:
                detector_stats[name]["tn"] += 1

    def _metrics(tp, fp, fn, tn):
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        total = tp + fp + fn + tn
        accuracy = (tp + tn) / total if total > 0 else 0.0
        return {
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "precision": round(precision * 100, 2),
            "recall": round(recall * 100, 2),
            "f1": round(f1 * 100, 2),
            "accuracy": round(accuracy * 100, 2),
        }

    return {
        "session_id": session_id,
        "labeled_events": len(rows),
        "ensemble": _metrics(ensemble_tp, ensemble_fp, ensemble_fn, ensemble_tn),
        "detectors": {
            name: _metrics(**stats) for name, stats in detector_stats.items()
        },
        "missed_attacks_count": ensemble_fn,
        "missed_attacks_sample": missed_attacks[:10],
    }


def list_sessions() -> list[dict]:
    """Return summary of all sessions that have events."""
    rows = _conn().execute(
        """
        SELECT session_id,
               COUNT(*) AS total,
               SUM(CASE WHEN prediction=1 THEN 1 ELSE 0 END) AS attacks,
               SUM(CASE WHEN expected_verdict IS NOT NULL THEN 1 ELSE 0 END) AS labeled,
               MIN(ts) AS started,
               MAX(ts) AS last_seen
        FROM events
        WHERE session_id IS NOT NULL
        GROUP BY session_id
        ORDER BY last_seen DESC
        LIMIT 50
        """
    ).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# Extended stats                                                                #
# --------------------------------------------------------------------------- #

def get_stats() -> dict:
    c = _conn()

    def scalar(sql: str, params: tuple = ()) -> int:
        row = c.execute(sql, params).fetchone()
        return int(row[0]) if row and row[0] is not None else 0

    total = scalar("SELECT COUNT(*) FROM events")
    attacks = scalar("SELECT COUNT(*) FROM events WHERE prediction = 1")
    normal = total - attacks
    alerts = scalar("SELECT COUNT(*) FROM events WHERE alerted = 1")

    since_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
    attacks_24h = scalar(
        "SELECT COUNT(*) FROM events WHERE prediction = 1 AND ts >= ?", (since_24h,)
    )

    # Action breakdown (BLOCK / ALLOW / REVIEW)
    action_rows = c.execute(
        "SELECT COALESCE(action,'ALLOW') AS action, COUNT(*) n FROM events GROUP BY action"
    ).fetchall()
    action_counts = {r["action"]: int(r["n"]) for r in action_rows}

    # Hourly time series for the last 24h.
    timeseries = []
    rows = {
        r["bucket"]: (r["attacks"], r["normal"])
        for r in c.execute(
            """
            SELECT substr(ts,1,13) AS bucket,
                   SUM(prediction) AS attacks,
                   SUM(CASE WHEN prediction=0 THEN 1 ELSE 0 END) AS normal
            FROM events WHERE ts >= ? GROUP BY bucket
            """,
            (since_24h,),
        ).fetchall()
    }
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    for i in range(23, -1, -1):
        b = (now - timedelta(hours=i)).strftime("%Y-%m-%dT%H")
        atk, nrm = rows.get(b, (0, 0))
        timeseries.append({"bucket": b + ":00Z", "hour": b[-2:] + ":00", "attacks": int(atk or 0), "normal": int(nrm or 0)})

    by_type = [
        {"type": r["attack_type"] or "Unknown", "count": int(r["n"])}
        for r in c.execute(
            "SELECT attack_type, COUNT(*) n FROM events WHERE prediction=1 "
            "GROUP BY attack_type ORDER BY n DESC"
        ).fetchall()
    ]
    by_country = [
        {"country": r["country"] or "Unknown", "count": int(r["n"])}
        for r in c.execute(
            "SELECT country, COUNT(*) n FROM events WHERE prediction=1 "
            "GROUP BY country ORDER BY n DESC LIMIT 10"
        ).fetchall()
    ]
    top_ips = [
        {"ip": r["source_ip"] or "?", "count": int(r["n"]), "country": r["country"]}
        for r in c.execute(
            "SELECT source_ip, country, COUNT(*) n FROM events WHERE prediction=1 "
            "GROUP BY source_ip ORDER BY n DESC LIMIT 8"
        ).fetchall()
    ]

    # Per-detector aggregate stats (from detectors_json column)
    detector_stats: dict[str, dict] = {}
    det_rows = c.execute(
        "SELECT detectors_json FROM events WHERE detectors_json IS NOT NULL LIMIT 5000"
    ).fetchall()
    for dr in det_rows:
        try:
            detectors = json.loads(dr["detectors_json"])
        except Exception:
            continue
        for d in detectors:
            name = d.get("name", "unknown")
            if name not in detector_stats:
                detector_stats[name] = {"total": 0, "suspicious": 0, "normal": 0}
            detector_stats[name]["total"] += 1
            if d.get("verdict") == "Suspicious":
                detector_stats[name]["suspicious"] += 1
            else:
                detector_stats[name]["normal"] += 1

    # Latency percentiles
    latency_rows = c.execute(
        "SELECT detection_latency_ms FROM events WHERE detection_latency_ms IS NOT NULL ORDER BY detection_latency_ms"
    ).fetchall()
    latencies = [r[0] for r in latency_rows if r[0] is not None]
    latency_stats: dict = {}
    if latencies:
        n = len(latencies)
        latency_stats = {
            "p50": round(latencies[int(n * 0.5)], 2),
            "p95": round(latencies[min(int(n * 0.95), n - 1)], 2),
            "p99": round(latencies[min(int(n * 0.99), n - 1)], 2),
            "avg": round(sum(latencies) / n, 2),
            "samples": n,
        }

    return {
        "totals": {
            "requests": total,
            "attacks": attacks,
            "normal": normal,
            "alerts": alerts,
            "attack_rate": round(100 * attacks / total, 1) if total else 0.0,
            "blocked": action_counts.get("BLOCK", 0),
            "allowed": action_counts.get("ALLOW", 0),
            "reviewed": action_counts.get("REVIEW", 0),
        },
        "last_24h": {"attacks": attacks_24h},
        "timeseries": timeseries,
        "by_type": by_type,
        "by_country": by_country,
        "top_ips": top_ips,
        "action_breakdown": {
            "BLOCK": action_counts.get("BLOCK", 0),
            "ALLOW": action_counts.get("ALLOW", 0),
            "REVIEW": action_counts.get("REVIEW", 0),
        },
        "detector_stats": detector_stats,
        "latency": latency_stats,
    }
