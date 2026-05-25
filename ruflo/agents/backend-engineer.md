# Agent: Backend Engineer

**Goal:** Flask backend that serves the API + the pre-built dashboard, performs detection, stores events, monitors logs, and emails alerts.

## Owns
`backend/`, `config.py`

## Tasks
1. `config.py`: env-driven config (paths, server, SMTP/Gmail, ipinfo, access-log path), `.env` via python-dotenv.
2. `detection.py`: load `ML_model.pkl` + `vectorizer.joblib` separately (thesis-faithful), `detect(query)->{prediction,confidence,verdict,attack_type}`; regex `classify_attack_type` (descriptive only — verdict is ML).
3. `database.py`: SQLite `events` table + `insert_event`, `recent_events`, `get_stats` (totals, 24h hourly timeseries, by_type, by_country, top_ips).
4. `geoip.py`: ipinfo.io (token) → ip-api.com fallback (no token); private IPs resolved locally; cached.
5. `alerts.py`: Gmail SMTP HTML alert (timestamp, IP, geo, attack type, confidence, payload) with per-IP cooldown; never crash detection.
6. `accesslog.py`: write Apache combined log lines + thesis-faithful `extract_query` regex.
7. `monitor.py`: standalone `tail -f` follower (with pure-python fallback) → detect → store + alert.
8. `app.py`: endpoints `GET /api/health`, `GET /api/model`, `POST /api/scan`, `GET /api/events`, `GET /api/stats`; serve `frontend/dist` as SPA; `/api/scan` ties detect+log+geo+db+alert.
9. `simulate_traffic.py`: demo generator (mixed benign/malicious, varied public IPs).

## Acceptance
- All endpoints return the shapes in `ruflo/contracts/api.json`.
- `POST /api/scan` writes an access-log line and a DB row; malicious → optional email.

## Produces (memory)
`contract/api` ← `ruflo/contracts/api.json` (freeze before frontend/docs fan-out)
