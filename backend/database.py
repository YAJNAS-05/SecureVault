"""SQLite event store for SQLInsight.

A single ``events`` table records every inspected request. Both the live API
(backend/app.py) and the standalone log monitor (backend/monitor.py) write here,
and the dashboard reads aggregated stats from it.
"""
from __future__ import annotations

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


def _conn() -> sqlite3.Connection:
    if getattr(_local, "conn", None) is None:
        _local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.executescript(_SCHEMA)
    return _local.conn


def init_db() -> None:
    _conn().executescript(_SCHEMA)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def insert_event(event: dict) -> int:
    fields = [
        "ts", "query", "prediction", "confidence", "verdict", "attack_type",
        "source_ip", "method", "path", "user_agent", "country", "region",
        "city", "lat", "lon", "source", "alerted",
    ]
    event.setdefault("ts", _now())
    values = [event.get(f) for f in fields]
    cur = _conn().execute(
        f"INSERT INTO events ({','.join(fields)}) VALUES ({','.join(['?'] * len(fields))})",
        values,
    )
    _conn().commit()
    return int(cur.lastrowid)


def recent_events(limit: int = 50, verdict: str | None = None) -> list[dict]:
    sql = "SELECT * FROM events"
    params: list = []
    if verdict in ("Suspicious", "Normal"):
        sql += " WHERE verdict = ?"
        params.append(verdict)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(int(limit))
    return [dict(r) for r in _conn().execute(sql, params).fetchall()]


def clear_events() -> int:
    """Delete all events and reset the auto-increment counter. Returns rows removed."""
    cur = _conn().execute("DELETE FROM events")
    try:
        _conn().execute("DELETE FROM sqlite_sequence WHERE name='events'")
    except sqlite3.OperationalError:
        pass  # sqlite_sequence may not exist yet
    _conn().commit()
    return cur.rowcount


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

    return {
        "totals": {
            "requests": total,
            "attacks": attacks,
            "normal": normal,
            "alerts": alerts,
            "attack_rate": round(100 * attacks / total, 1) if total else 0.0,
        },
        "last_24h": {"attacks": attacks_24h},
        "timeseries": timeseries,
        "by_type": by_type,
        "by_country": by_country,
        "top_ips": top_ips,
    }
