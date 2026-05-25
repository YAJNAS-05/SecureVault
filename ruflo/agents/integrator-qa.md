# Agent: Integrator / QA

**Goal:** Make it run end-to-end and clone-and-run on macOS.

## Owns
`run.sh`, `setup.sh`, `tests/`

## Tasks
1. **Mac scripts**
   - `setup.sh`: create `.venv`, `pip install -r requirements.txt`, copy `.env.example`→`.env` if missing, train model if artifacts missing, ensure `frontend/dist` present.
   - `run.sh`: activate venv and launch `python backend/app.py`; print the dashboard URL.
2. **E2E test** — start the server; `POST /api/scan` with a canonical attack and a benign string; assert verdicts; `GET /api/stats` and `/api/events` return populated data; run `simulate_traffic.py`; confirm the dashboard (`/`) serves `index.html`.
3. **Smoke the monitor** — append a malicious line to the access log; confirm `monitor.py` flags it.
4. **Clone-and-run check** — confirm only `pip install` is required (model + `frontend/dist` pre-built/committed); no npm at runtime.

## Acceptance
- `./setup.sh && ./run.sh` works on a clean checkout.
- All endpoints healthy; canonical attacks caught; dashboard loads.
- Hands off to the Security Reviewer for final sign-off.
