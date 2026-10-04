"""Train and evaluate the SQLInsight detection models.

Trains TWO models using the SAME fitted vectorizer (fair comparison):
  1. LogisticRegression  (existing — same config, keeps all existing metrics)
  2. RandomForestClassifier (new — for ensemble + research comparison)

Experiment 1 (within-distribution): train/test 80/20 split of
    data/Modified_SQL_Dataset.csv          (~30.9k rows)
Experiment 2 (generalisation): evaluate on
    data/clean_sql_dataset.csv             (~148.3k rows)
  reported two ways:
    - full        : the whole clean dataset (thesis style)
    - unseen-only : clean rows whose Query never appears in the training set
                    (~79% of clean) -> the honest generalisation number.

Artifacts written to ml/artifacts/
    ML_model.pkl       fitted LogisticRegression (deployed on 100% of train)
    RF_model.pkl       fitted RandomForestClassifier (same vectorizer)
    vectorizer.joblib  fitted feature pipeline
    metrics.json       all metrics + metadata (consumed by the dashboard)

Run:  python ml/train_model.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import (  # noqa: E402
    EVAL_DATASET,
    METRICS_PATH,
    MODEL_PATH,
    RF_MODEL_PATH,
    TRAIN_DATASET,
    VECTORIZER_PATH,
)
from ml.preprocess import build_vectorizer, load_dataset  # noqa: E402

RANDOM_STATE = 42


def _scores(y_true, y_pred) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)) * 100, 2),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)) * 100, 2),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)) * 100, 2),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)) * 100, 2),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "samples": int(len(y_true)),
    }


def _print_block(title: str, m: dict) -> None:
    cm = m["confusion_matrix"]
    print(f"\n=== {title} ({m['samples']:,} samples) ===")
    print(f"  Accuracy : {m['accuracy']:.2f}%   Precision: {m['precision']:.2f}%")
    print(f"  Recall   : {m['recall']:.2f}%   F1-score : {m['f1']:.2f}%")
    print(f"  Confusion: TP={cm['tp']:,}  TN={cm['tn']:,}  FP={cm['fp']:,}  FN={cm['fn']:,}")


def main() -> None:
    t0 = time.time()
    print("Loading datasets...")
    train_df = load_dataset(TRAIN_DATASET)
    eval_df = load_dataset(EVAL_DATASET)
    print(f"  train (exp1): {len(train_df):,} rows  {train_df['Label'].value_counts().to_dict()}")
    print(f"  eval  (exp2): {len(eval_df):,} rows  {eval_df['Label'].value_counts().to_dict()}")

    # ---- Fit feature pipeline on the full training corpus ----
    print("\nFitting feature pipeline (word + char n-grams)...")
    vectorizer = build_vectorizer()
    X_all = vectorizer.fit_transform(train_df["Query"])
    y_all = train_df["Label"].to_numpy()
    print(f"  feature matrix: {X_all.shape[0]:,} x {X_all.shape[1]:,}")

    lr_kwargs = dict(C=4.0, solver="liblinear", max_iter=1000, class_weight="balanced")
    rf_kwargs = dict(n_estimators=100, class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1)

    # ---- Experiment 1: 80/20 split ----
    print("\nExperiment 1 -- 80/20 split on Modified_SQL_Dataset.csv")
    X_tr, X_te, y_tr, y_te = train_test_split(
        X_all, y_all, test_size=0.2, random_state=RANDOM_STATE, stratify=y_all
    )

    print("  Training LR on 80% split...")
    clf_lr_split = LogisticRegression(**lr_kwargs).fit(X_tr, y_tr)
    exp1_lr = _scores(y_te, clf_lr_split.predict(X_te))
    exp1_lr["train_size"], exp1_lr["test_size"] = int(X_tr.shape[0]), int(X_te.shape[0])
    _print_block("Experiment 1 LR: within-distribution (held-out 20%)", exp1_lr)

    print("  Training RF on 80% split (may take ~30-60s)...")
    t_rf = time.time()
    clf_rf_split = RandomForestClassifier(**rf_kwargs).fit(X_tr, y_tr)
    print(f"  RF trained in {time.time() - t_rf:.1f}s")
    exp1_rf = _scores(y_te, clf_rf_split.predict(X_te))
    exp1_rf["train_size"], exp1_rf["test_size"] = int(X_tr.shape[0]), int(X_te.shape[0])
    _print_block("Experiment 1 RF: within-distribution (held-out 20%)", exp1_rf)

    # ---- Final deployed models: train on 100% of the training data ----
    print("\nTraining final LR model on 100% of training data (for deployment)...")
    model_lr = LogisticRegression(**lr_kwargs).fit(X_all, y_all)

    print("Training final RF model on 100% of training data (may take ~30-60s)...")
    t_rf2 = time.time()
    model_rf = RandomForestClassifier(**rf_kwargs).fit(X_all, y_all)
    print(f"  RF final trained in {time.time() - t_rf2:.1f}s")

    # ---- Experiment 2: generalisation to clean_sql_dataset.csv ----
    print("\nExperiment 2 -- generalisation to clean_sql_dataset.csv")
    Xe = vectorizer.transform(eval_df["Query"])
    ye = eval_df["Label"].to_numpy()

    # LR
    pred_lr_full = model_lr.predict(Xe)
    exp2_lr_full = _scores(ye, pred_lr_full)
    _print_block("Experiment 2 LR: full clean dataset (thesis style)", exp2_lr_full)

    train_queries = set(train_df["Query"].str.strip())
    unseen_mask = ~eval_df["Query"].str.strip().isin(train_queries)
    exp2_lr_unseen = _scores(ye[unseen_mask.to_numpy()], pred_lr_full[unseen_mask.to_numpy()])
    _print_block("Experiment 2 LR: UNSEEN-only (honest generalisation)", exp2_lr_unseen)

    # RF
    pred_rf_full = model_rf.predict(Xe)
    exp2_rf_full = _scores(ye, pred_rf_full)
    _print_block("Experiment 2 RF: full clean dataset", exp2_rf_full)

    exp2_rf_unseen = _scores(ye[unseen_mask.to_numpy()], pred_rf_full[unseen_mask.to_numpy()])
    _print_block("Experiment 2 RF: UNSEEN-only (honest generalisation)", exp2_rf_unseen)

    # ---- Persist artifacts ----
    joblib.dump(model_lr, MODEL_PATH)
    joblib.dump(model_rf, RF_MODEL_PATH)
    joblib.dump(vectorizer, VECTORIZER_PATH)

    metrics = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sklearn_version": sklearn.__version__,
        # --- LR (primary model, backwards-compat) ---
        "model": "LogisticRegression",
        "model_params": lr_kwargs,
        "features": {
            "n_features": int(X_all.shape[1]),
            "vectorizer": "FeatureUnion(word 1-2 gram + char_wb 3-5 gram) -> VarianceThreshold",
        },
        "datasets": {
            "train": {"file": TRAIN_DATASET.name, "rows": int(len(train_df))},
            "eval": {"file": EVAL_DATASET.name, "rows": int(len(eval_df))},
            "overlap_note": "train is ~entirely contained in eval; unseen-only excludes it",
        },
        "experiment_1": exp1_lr,
        "experiment_2_full": exp2_lr_full,
        "experiment_2_unseen": exp2_lr_unseen,
        "headline": {
            "accuracy": exp1_lr["accuracy"],
            "precision": exp1_lr["precision"],
            "recall": exp1_lr["recall"],
            "f1": exp1_lr["f1"],
        },
        # --- RF (new model) ---
        "rf_model": "RandomForestClassifier",
        "rf_model_params": rf_kwargs,
        "rf_experiment_1": exp1_rf,
        "rf_experiment_2_full": exp2_rf_full,
        "rf_experiment_2_unseen": exp2_rf_unseen,
        "rf_headline": {
            "accuracy": exp1_rf["accuracy"],
            "precision": exp1_rf["precision"],
            "recall": exp1_rf["recall"],
            "f1": exp1_rf["f1"],
        },
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2))
    print(f"\nSaved LR model   -> {MODEL_PATH}")
    print(f"Saved RF model   -> {RF_MODEL_PATH}")
    print(f"Saved vectorizer -> {VECTORIZER_PATH}")
    print(f"Saved metrics    -> {METRICS_PATH}")
    print(f"Done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
