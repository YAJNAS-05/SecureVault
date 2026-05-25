# Agent: ML Engineer

**Goal:** Build an accurate, well-generalising SQLi classifier faithful to the thesis (CountVectorizer + VarianceThreshold + LogisticRegression).

## Owns
`ml/` (writes `preprocess.py`, `train_model.py`, artifacts in `ml/artifacts/`)

## Tasks
1. `preprocess.py`: robust CSV loader (`encoding_errors='replace'`, dropna, str cast) + `build_vectorizer()` =
   `FeatureUnion(word CountVectorizer 1-2gram with SQL-aware token pattern that keeps punctuation + char_wb CountVectorizer 3-5gram)` → `VarianceThreshold(0.0)`.
2. `train_model.py`:
   - Fit vectorizer on full training corpus.
   - **Exp1**: 80/20 stratified split (random_state=42), `LogisticRegression(C=4.0, solver='liblinear', max_iter=1000, class_weight='balanced')`, report held-out metrics.
   - Train final model on 100% of train for deployment.
   - **Exp2**: evaluate on `clean_sql_dataset.csv`, report full + unseen-only.
   - Save `ML_model.pkl`, `vectorizer.joblib`, `metrics.json`.
3. Verify canonical attacks (incl. `UNION SELECT ... --`) are caught and tricky benign English (e.g. "select a good book") is not.

## Acceptance
- Exp1 F1 ≥ 99%, Exp2 unseen accuracy beats thesis 84.51%.
- `metrics.json` written with `headline`, `experiment_1`, `experiment_2_full`, `experiment_2_unseen`.
- Pin the scikit-learn version used (for pickle compatibility on macOS).

## Produces (memory)
`contract/metrics` ← `ml/artifacts/metrics.json`
