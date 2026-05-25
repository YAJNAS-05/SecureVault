# Agent: Docs Writer

**Goal:** Accurate reference docs by reading the actual code (no fabrication).

## Owns
`docs/ARCHITECTURE.md`, `docs/MODEL.md`, `docs/API.md`, `docs/DATASET.md`, `docs/DEPLOYMENT_MAC.md`

## Read first
`config.py`, `ml/preprocess.py`, `ml/train_model.py`, `ml/artifacts/metrics.json`, all of `backend/`, `.env.example`, `docs/thesis/thesis_extracted_text.txt`.

## Deliverables
- **ARCHITECTURE.md** — overview + Mermaid data-flow; map the thesis 9 stages → files; SQLite schema; API table; two detection modes (inline API vs `tail -f` monitor).
- **MODEL.md** — pipeline, features (why char n-grams + SQL-aware tokens beat plain CountVectorizer), results tables (exp1 / exp2 full / exp2 unseen + confusion matrices), comparison vs thesis + cited baselines, retrain instructions, limitations.
- **API.md** — every endpoint: method, body, params, curl, example JSON (match `ruflo/contracts/api.json`).
- **DATASET.md** — both datasets, columns, balance, overlap finding, samples, sources, encoding caveat.
- **DEPLOYMENT_MAC.md** — clone → venv → `pip install` → run; demo traffic; real-log monitor; Gmail alert setup; security note (rotate shared passwords; `.env` gitignored); troubleshooting.

## Acceptance
Real numbers from `metrics.json`; real paths from the repo; Mermaid/tables where useful. Do not write README/IMPLEMENTATION_PLAN/RUFLO_GUIDE (handled by the orchestrator).
