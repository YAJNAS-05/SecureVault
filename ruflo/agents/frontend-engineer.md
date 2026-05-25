# Agent: Frontend Engineer

**Goal:** An impressive, modern React dashboard, pre-built so macOS serves it with Python only.

## Owns
`frontend/` → committed `frontend/dist/`

## Stack
Vite + React + TypeScript + Tailwind + Recharts + lucide-react. `fetch` for API.

## Build config (critical)
- `vite.config.ts`: `base: './'`, dev proxy `{'/api':'http://127.0.0.1:5000'}`.
- Output default `frontend/dist/` (`dist/index.html` + `dist/assets/*`).
- Call API at **relative** paths so dev (proxy) and prod (Flask same-origin) both work.

## Sections
1. Hero + **Live Scanner** (POST `/api/scan`): verdict badge, confidence gauge, attack type, geo, clickable example payloads.
2. KPI cards: requests, attacks, attack rate, model accuracy.
3. Threat timeline (Recharts area) from `stats.timeseries`.
4. Attack-types donut/bar from `stats.by_type`.
5. Top source IPs + by-country from `stats.top_ips` / `stats.by_country`.
6. Live feed: poll `/api/events` every 4s; suspicious rows highlighted.
7. Model card: headline metrics + confusion matrix (`experiment_1`) + Exp1-vs-Exp2 comparison.

## Design
Dark (#0a0a0f), violet accent (#7c3aed/#a855f7), green=safe / red=threat, glassmorphism, rounded-2xl, smooth transitions, "● Live" badge + health.

## Acceptance
- `npm run build` succeeds with no TS errors; `frontend/dist/index.html` + `dist/assets/` exist.
- Reads only `contract/api` + `contract/metrics`; no edits outside `frontend/`.
- `node_modules` not committed.
