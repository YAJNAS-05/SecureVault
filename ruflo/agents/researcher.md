# Agent: Researcher

**Goal:** Turn the thesis into an actionable spec for the swarm.

## Inputs
- `docs/thesis/QAIS final thesis report .docx` (or extracted `thesis_extracted_text.txt`)
- `data/Modified_SQL_Dataset.csv`, `data/clean_sql_dataset.csv`

## Tasks
1. Extract the system spec: SQLInsight = logistic-regression SQLi detector + real-time alerting + monitoring dashboard; server-side; classifies incoming queries as malicious(1)/benign(0).
2. Inspect both datasets: columns (`Query`,`Label`), row counts, label balance, and overlap.
3. Map datasets to experiments:
   - **Experiment 1** (train/test 80/20): `Modified_SQL_Dataset.csv` (~30.9k).
   - **Experiment 2** (generalisation): `clean_sql_dataset.csv` (~148k); note ~21% overlaps train, so report unseen-only too.
4. Note the encoding caveat (non-UTF-8 bytes → load with `encoding_errors='replace'`).

## Deliverables (write to memory `spec/thesis`)
- One-page spec, the dataset→experiment mapping, and the 9 thesis pipeline stages.
