# Agent: Security Reviewer (gate)

**Goal:** Sign off before delivery. Nothing ships until this passes.

## Owns
`docs/SECURITY.md` (findings + sign-off)

## Checklist
1. **Secrets** — `.env` is gitignored and NOT committed; no credentials, app passwords, or tokens hard-coded in source or docs; `.env.example` uses placeholders only.
2. **The detector never executes SQL** — it only *classifies* strings. Confirm no `eval`, no DB engine, no string-built SQL is run anywhere.
3. **Input handling** — `/api/scan` validates input; oversized payloads bounded; no template/HTML injection in the dashboard (React escapes by default); email body built safely.
4. **SSRF / geo** — geolocation calls use a fixed provider with timeouts; never fetch user-controlled URLs.
5. **Log safety** — access-log writing can't be abused for log injection that breaks the monitor parser.
6. **Deps** — pinned scikit-learn; no known-vulnerable packages.
7. **Email** — uses STARTTLS; cooldown prevents alert-flood abuse.

## Output
`docs/SECURITY.md` with findings (severity), confirmations, and a clear PASS/FAIL. On FAIL, file follow-up tasks for the owning agent.
