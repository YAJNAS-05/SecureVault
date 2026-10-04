"""SQLInsight Flask application — v2 Detection & Defense Engine.

Serves the REST API and the pre-built React dashboard (frontend/dist). Running
this single file is enough to use the whole product:

    python backend/app.py

Endpoints (all JSON):
    GET  /api/health           service + model status
    GET  /api/model            model metadata + metrics (ml/artifacts/metrics.json)
    POST /api/scan             {query, source_ip?, source?, session_id?, endpoint?} -> detection result
    POST /api/evaluate         {query, expected_verdict, ...} -> labeled evaluation event
    GET  /api/events           recent events  (?limit=&verdict=&session_id=&action=)
    GET  /api/stats            aggregated dashboard statistics (extended v2)
    GET  /api/detectors        metadata about all active detectors
    GET  /api/sessions         list of all sessions with events
    GET  /api/sessions/<id>    per-session evaluation metrics (TP/FP/FN per detector)
    POST /api/reset            clear all events (dashboard reset)

Integration (SecureBank / Red-Team Agent):
    POST /api/scan  with  { "query": "...", "source": "securebank" | "redteam" }
    Response includes  action: "BLOCK" | "ALLOW" | "REVIEW"
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
import alerts     # noqa: E402
import database   # noqa: E402
import detection  # noqa: E402
import geoip      # noqa: E402
from config import (  # noqa: E402
    ALERTS_ENABLED,
    COLLECTED_PAYLOADS_PATH,
    ENSEMBLE_POLICY,
    FRONTEND_DIST,
    HOST,
    METRICS_PATH,
    PORT,
    VERSION,
)

app = Flask(__name__, static_folder=None)
database.init_db()


@app.after_request
def _cors(response):
    """Allow cross-origin requests for dev integration (SecureBank demo, Red-Team agent)."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/api/scan", methods=["OPTIONS"])
@app.route("/api/evaluate", methods=["OPTIONS"])
def _preflight():
    return "", 204

DEFAULT_UA = "SQLInsight-Client"


# --------------------------------------------------------------------------- #
# Health & model info                                                           #
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health():
    return jsonify(
        status="ok",
        version=VERSION,
        model_loaded=detection.model_loaded(),
        rf_model_loaded=detection.rf_model_loaded(),
        alerts_enabled=ALERTS_ENABLED,
        ensemble_policy=ENSEMBLE_POLICY,
    )


@app.get("/api/model")
def model_info():
    if METRICS_PATH.exists():
        return jsonify(json.loads(METRICS_PATH.read_text()))
    return jsonify(error="metrics not found; run ml/train_model.py"), 404


@app.get("/api/detectors")
def detectors_info():
    """Metadata about all active detectors."""
    info = [
        {
            "name": "rule",
            "type": "regex",
            "description": "9 hand-crafted regex patterns covering canonical SQLi categories",
            "speed_ms_approx": 0.1,
            "loaded": True,
        },
        {
            "name": "lr",
            "type": "ml:LogisticRegression",
            "description": "Logistic Regression on word + char n-gram features (80k features)",
            "speed_ms_approx": 2.0,
            "loaded": detection.model_loaded(),
        },
        {
            "name": "rf",
            "type": "ml:RandomForestClassifier",
            "description": "Random Forest on same feature space as LR; better on boundary cases",
            "speed_ms_approx": 5.0,
            "loaded": detection.rf_model_loaded(),
        },
    ]
    return jsonify(detectors=info, ensemble_policy=ENSEMBLE_POLICY)


# --------------------------------------------------------------------------- #
# Core detection endpoint                                                       #
# --------------------------------------------------------------------------- #

@app.post("/api/scan")
def scan():
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify(error="missing 'query'"), 400

    source_ip  = data.get("source_ip") or request.remote_addr or "127.0.0.1"
    source     = data.get("source") or "scanner"
    method     = (data.get("method") or "GET").upper()
    user_agent = data.get("user_agent") or request.headers.get("User-Agent", DEFAULT_UA)
    path       = data.get("path") or data.get("endpoint") or "/search"
    session_id = data.get("session_id") or None

    # Run multi-detector pipeline
    result = detection.detect_multi(query)
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
        "session_id": session_id,
        "detection_latency_ms": result.get("latency_ms"),
        # detectors list is stored via detectors_json in insert_event
    }

    if result["prediction"] == 1:
        if alerts.send_alert(event):
            event["alerted"] = 1

        # Capture novel payloads for research (P1)
        _capture_payload(query, result)

    event_id = database.insert_event(event)
    event["id"] = event_id
    return jsonify(event)


@app.post("/api/evaluate")
def evaluate():
    """Labeled evaluation endpoint for Red-Team Agent.

    Accepts the same payload as /api/scan plus:
        expected_verdict: 'Suspicious' | 'Normal'   (required)
        session_id: str                              (required for session grouping)

    Stores the expected_verdict alongside all detector results so
    GET /api/sessions/<id> can compute TP/FP/FN/TN per detector.
    """
    data = request.get_json(silent=True) or {}
    query = (data.get("query") or "").strip()
    if not query:
        return jsonify(error="missing 'query'"), 400

    expected_verdict = data.get("expected_verdict")
    if expected_verdict not in ("Suspicious", "Normal"):
        return jsonify(error="expected_verdict must be 'Suspicious' or 'Normal'"), 400

    session_id = data.get("session_id") or "redteam-default"
    source_ip  = data.get("source_ip") or request.remote_addr or "127.0.0.1"
    source     = data.get("source") or "redteam"
    path       = data.get("path") or data.get("endpoint") or "/evaluate"

    result = detection.detect_multi(query)
    geo = geoip.geolocate(source_ip)

    from urllib.parse import quote
    log_line = accesslog.write_access_log(
        source_ip, "POST", f"{path}?q={quote(query)}"
    )

    event = {
        **result,
        "source_ip": source_ip,
        "method": "POST",
        "path": path,
        "user_agent": data.get("user_agent") or DEFAULT_UA,
        "source": source,
        "log_line": log_line.strip(),
        **geo,
        "alerted": 0,
        "session_id": session_id,
        "detection_latency_ms": result.get("latency_ms"),
        "expected_verdict": expected_verdict,
    }

    event_id = database.insert_event(event)
    event["id"] = event_id

    # Include correctness inline for the caller
    is_correct = result["verdict"] == expected_verdict
    event["correct"] = is_correct
    event["expected_verdict"] = expected_verdict

    return jsonify(event)


# --------------------------------------------------------------------------- #
# Data retrieval endpoints                                                      #
# --------------------------------------------------------------------------- #

@app.post("/api/reset")
def reset():
    """Clear all recorded detections (resets the dashboard counters to zero)."""
    cleared = database.clear_events()
    return jsonify(status="ok", cleared=cleared)


@app.get("/api/events")
def events():
    limit      = min(int(request.args.get("limit", 50)), 500)
    verdict    = request.args.get("verdict")
    session_id = request.args.get("session_id")
    action     = request.args.get("action")
    return jsonify(events=database.recent_events(
        limit=limit, verdict=verdict, session_id=session_id, action=action
    ))


@app.get("/api/stats")
def stats():
    data = database.get_stats()
    if METRICS_PATH.exists():
        m = json.loads(METRICS_PATH.read_text())
        data["model"] = m.get("headline", {})
        data["model"]["generalisation"] = m.get("experiment_2_unseen", {})
        # RF metrics (if available)
        if "rf_headline" in m:
            data["rf_model"] = m.get("rf_headline", {})
            data["rf_model"]["generalisation"] = m.get("rf_experiment_2_unseen", {})
    return jsonify(data)


@app.get("/api/sessions")
def sessions():
    return jsonify(sessions=database.list_sessions())


@app.get("/api/sessions/<session_id>")
def session_detail(session_id: str):
    return jsonify(database.get_session(session_id))


# --------------------------------------------------------------------------- #
# Serve the pre-built React dashboard (frontend/dist)                          #
# --------------------------------------------------------------------------- #

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


# --------------------------------------------------------------------------- #
# Internal helpers                                                              #
# --------------------------------------------------------------------------- #

def _capture_payload(query: str, result: dict) -> None:
    """Append novel undetected payloads to a JSONL file for research (P1)."""
    # Capture payloads where detectors disagreed (potential false-positive/novel)
    if result.get("disagreement"):
        try:
            import json as _json
            record = _json.dumps({
                "query": query,
                "action": result.get("action"),
                "detectors": result.get("detectors", []),
                "ts": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            })
            with open(COLLECTED_PAYLOADS_PATH, "a", encoding="utf-8") as f:
                f.write(record + "\n")
        except Exception:
            pass  # Non-critical; never crash the scan endpoint


def main() -> None:
    print(
        f"SQLInsight v{VERSION}  |  "
        f"lr={detection.model_loaded()}  rf={detection.rf_model_loaded()}  "
        f"alerts={ALERTS_ENABLED}  policy={ENSEMBLE_POLICY}"
    )
    print(f"Dashboard: http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=bool(os.getenv("FLASK_DEBUG")), threaded=True)


if __name__ == "__main__":
    main()
