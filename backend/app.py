"""SQLInsight Flask application.

Serves the REST API and the pre-built React dashboard (frontend/dist). Running
this single file is enough to use the whole product:

    python backend/app.py

Endpoints (all JSON):
    GET  /api/health           service + model status
    GET  /api/model            model metadata + metrics (ml/artifacts/metrics.json)
    POST /api/scan             {query, source_ip?, source?} -> detection result
    GET  /api/events           recent events  (?limit=&verdict=)
    GET  /api/stats            aggregated dashboard statistics
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

_BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_BACKEND_DIR))
sys.path.insert(0, str(_BACKEND_DIR.parent))

import accesslog  # noqa: E402
import alerts  # noqa: E402
import database  # noqa: E402
import detection  # noqa: E402
import geoip  # noqa: E402
from config import (  # noqa: E402
    ALERTS_ENABLED,
    FRONTEND_DIST,
    HOST,
    METRICS_PATH,
    PORT,
    VERSION,
)

app = Flask(__name__, static_folder=None)
database.init_db()

DEFAULT_UA = "SQLInsight-Client"


@app.get("/api/health")
def health():
    return jsonify(
        status="ok",
        version=VERSION,
        model_loaded=detection.model_loaded(),
        alerts_enabled=ALERTS_ENABLED,
    )


@app.get("/api/model")
def model_info():
    if METRICS_PATH.exists():
        return jsonify(json.loads(METRICS_PATH.read_text()))
    return jsonify(error="metrics not found; run ml/train_model.py"), 404


@app.post("/api/scan")
def scan():
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify(error="missing 'query'"), 400

    source_ip = data.get("source_ip") or request.remote_addr or "127.0.0.1"
    source = data.get("source") or "scanner"
    method = (data.get("method") or "GET").upper()
    user_agent = data.get("user_agent") or request.headers.get("User-Agent", DEFAULT_UA)
    path = data.get("path") or "/search"

    result = detection.detect(query)
    geo = geoip.geolocate(source_ip)

    # Write an Apache-style access log line (feeds the standalone monitor too).
    from urllib.parse import quote
    log_line = accesslog.write_access_log(
        source_ip, method, f"{path}?q={quote(query)}", user_agent=user_agent
    )

    event = {
        **result,
        "source_ip": source_ip,
        "method": method,
        "path": path,
        "user_agent": user_agent,
        "source": source,
        "log_line": log_line.strip(),
        **geo,
        "alerted": 0,
    }

    if result["prediction"] == 1:
        if alerts.send_alert(event):
            event["alerted"] = 1

    event_id = database.insert_event(event)
    event["id"] = event_id
    return jsonify(event)


@app.post("/api/reset")
def reset():
    """Clear all recorded detections (resets the dashboard counters to zero)."""
    cleared = database.clear_events()
    return jsonify(status="ok", cleared=cleared)


@app.get("/api/events")
def events():
    limit = min(int(request.args.get("limit", 50)), 500)
    verdict = request.args.get("verdict")
    return jsonify(events=database.recent_events(limit=limit, verdict=verdict))


@app.get("/api/stats")
def stats():
    data = database.get_stats()
    if METRICS_PATH.exists():
        m = json.loads(METRICS_PATH.read_text())
        data["model"] = m.get("headline", {})
        data["model"]["generalisation"] = m.get("experiment_2_unseen", {})
    return jsonify(data)


# ---- Serve the pre-built React dashboard (frontend/dist) ----
@app.get("/")
@app.get("/<path:resource>")
def spa(resource: str = ""):
    if resource.startswith("api/"):
        return jsonify(error="not found"), 404
    if not FRONTEND_DIST.exists():
        return (
            "<h1>SQLInsight backend is running</h1>"
            "<p>Frontend not built yet. Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>, "
            "or use the API at <code>/api/health</code>.</p>",
            200,
        )
    target = FRONTEND_DIST / resource
    if resource and target.exists() and target.is_file():
        return send_from_directory(FRONTEND_DIST, resource)
    return send_from_directory(FRONTEND_DIST, "index.html")


def main() -> None:
    print(f"SQLInsight v{VERSION}  |  model_loaded={detection.model_loaded()}  alerts={ALERTS_ENABLED}")
    print(f"Dashboard: http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=bool(os.getenv("FLASK_DEBUG")), threaded=True)


if __name__ == "__main__":
    main()
