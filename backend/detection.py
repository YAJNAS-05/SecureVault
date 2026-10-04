"""SQLInsight multi-detector detection service.

Architecture
------------
Three complementary detectors run in parallel for every query:

  RuleDetector  — regex patterns (9 attack categories). Fast (~0.1ms).
                  Provides explainability via ``matched_rule``.
  LRDetector    — LogisticRegression ML model (existing, trusted).
                  ~2ms. High precision 99.96%.
  RFDetector    — RandomForestClassifier ML model (new).
                  ~5ms. Better recall on boundary cases.

All three are aggregated by ``backend/ensemble.py`` into a final
``action: BLOCK | ALLOW | REVIEW``.

The original ``detect()`` is preserved for backwards-compatibility.
New callers should use ``detect_multi()``.
"""
from __future__ import annotations

import re
import sys
import time
from functools import lru_cache
from pathlib import Path
from typing import List

import joblib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import (  # noqa: E402
    DETECTION_THRESHOLD,
    ENSEMBLE_POLICY,
    MODEL_PATH,
    RF_MODEL_PATH,
    VECTORIZER_PATH,
)
import ensemble  # noqa: E402 (sibling module)

# --------------------------------------------------------------------------- #
# Attack-type regex patterns (descriptive; also used by RuleDetector verdicts) #
# --------------------------------------------------------------------------- #
_ATTACK_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("Tautology / Auth Bypass", re.compile(r"(\bor\b|\band\b)\s+['\"]?\d+['\"]?\s*=\s*['\"]?\d+", re.I)),
    ("Tautology / Auth Bypass", re.compile(r"['\"]?\s*(or|and)\s+['\"]?\w+['\"]?\s*=\s*['\"]?\w+", re.I)),
    ("Union-based", re.compile(r"\bunion\b(\s+all)?\s+select\b", re.I)),
    ("Stacked Queries", re.compile(r";\s*(drop|insert|update|delete|create|alter|exec)\b", re.I)),
    ("Time-based Blind", re.compile(r"\b(sleep|pg_sleep|waitfor\s+delay|benchmark)\b", re.I)),
    ("Error-based", re.compile(r"\b(extractvalue|updatexml|utl_inaddr|convert\s*\(|cast\s*\()", re.I)),
    ("Command Execution", re.compile(r"\b(xp_cmdshell|exec\s*\(|sp_executesql)\b", re.I)),
    ("Comment Injection", re.compile(r"(--|#|/\*)", re.I)),
    ("Schema Enumeration", re.compile(r"\b(information_schema|sys\.|all_tables|table_name|version\s*\()", re.I)),
]


def classify_attack_type(query: str) -> str:
    """Return the first matching attack category label, or 'Generic / Obfuscated'."""
    for label, pattern in _ATTACK_PATTERNS:
        if pattern.search(query):
            return label
    return "Generic / Obfuscated"


# --------------------------------------------------------------------------- #
# Artifact loading (cached per-process)                                        #
# --------------------------------------------------------------------------- #

@lru_cache(maxsize=1)
def _load_lr():
    """Load the LogisticRegression model + shared vectorizer."""
    if not MODEL_PATH.exists() or not VECTORIZER_PATH.exists():
        raise FileNotFoundError(
            f"LR model artifacts not found. Run `python ml/train_model.py` first.\n"
            f"  expected: {MODEL_PATH}\n            {VECTORIZER_PATH}"
        )
    return joblib.load(MODEL_PATH), joblib.load(VECTORIZER_PATH)


@lru_cache(maxsize=1)
def _load_rf():
    """Load the RandomForest model (uses same vectorizer as LR)."""
    if not RF_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"RF model not found. Run `python ml/train_model.py` first.\n"
            f"  expected: {RF_MODEL_PATH}"
        )
    # Vectorizer is already loaded by _load_lr(); reuse it.
    _, vectorizer = _load_lr()
    return joblib.load(RF_MODEL_PATH), vectorizer


def model_loaded() -> bool:
    """True if the LR model is loadable (minimum requirement)."""
    try:
        _load_lr()
        return True
    except Exception:
        return False


def rf_model_loaded() -> bool:
    """True if the RF model is loadable."""
    try:
        _load_rf()
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# Individual detectors                                                          #
# --------------------------------------------------------------------------- #

def _rule_detector(query: str) -> dict:
    """Regex-based detector. Verdict is based on pattern match."""
    matched_rule = None
    verdict = "Normal"
    for label, pattern in _ATTACK_PATTERNS:
        if pattern.search(query):
            matched_rule = label
            verdict = "Suspicious"
            break
    confidence = 1.0 if verdict == "Suspicious" else 0.0
    result: dict = {
        "name": "rule",
        "verdict": verdict,
        "confidence": confidence,
    }
    if matched_rule:
        result["matched_rule"] = matched_rule
    return result


def _lr_detector(query: str, vectorizer) -> dict:
    """LogisticRegression ML detector."""
    model, _ = _load_lr()
    X = vectorizer.transform([query])
    proba = float(model.predict_proba(X)[0][1])
    prediction = int(proba >= DETECTION_THRESHOLD)
    return {
        "name": "lr",
        "verdict": "Suspicious" if prediction == 1 else "Normal",
        "confidence": round(proba, 4),
    }


def _rf_detector(query: str, vectorizer) -> dict:
    """RandomForest ML detector."""
    model, _ = _load_rf()
    X = vectorizer.transform([query])
    proba = float(model.predict_proba(X)[0][1])
    prediction = int(proba >= DETECTION_THRESHOLD)
    return {
        "name": "rf",
        "verdict": "Suspicious" if prediction == 1 else "Normal",
        "confidence": round(proba, 4),
    }


# --------------------------------------------------------------------------- #
# Public API                                                                    #
# --------------------------------------------------------------------------- #

def detect_multi(query: str) -> dict:
    """Run all detectors and return a full structured result.

    Returns:
        {
          query, attack_type,
          action,          # BLOCK | ALLOW | REVIEW
          verdict,         # legacy: Suspicious | Normal  (derived from action)
          prediction,      # legacy: 1 | 0               (1 = attack)
          confidence,      # ensemble average confidence
          detectors,       # list of per-detector dicts
          disagreement,    # bool: detectors disagree
          latency_ms,      # total detection time in ms
        }
    """
    query = "" if query is None else str(query)
    t0 = time.perf_counter()

    detector_results: List[dict] = []

    # Rule detector (always runs; no model needed)
    try:
        detector_results.append(_rule_detector(query))
    except Exception as exc:
        detector_results.append({"name": "rule", "verdict": "Normal", "confidence": 0.0, "error": str(exc)})

    # LR detector
    try:
        _, vectorizer = _load_lr()
        detector_results.append(_lr_detector(query, vectorizer))
    except Exception as exc:
        detector_results.append({"name": "lr", "verdict": "Normal", "confidence": 0.0, "error": str(exc)})

    # RF detector (optional; degrades gracefully if not yet trained)
    try:
        _, vectorizer = _load_rf()
        detector_results.append(_rf_detector(query, vectorizer))
    except FileNotFoundError:
        pass  # RF not trained yet — run with two detectors
    except Exception as exc:
        detector_results.append({"name": "rf", "verdict": "Normal", "confidence": 0.0, "error": str(exc)})

    decision = ensemble.decide(detector_results, policy=ENSEMBLE_POLICY)
    latency_ms = round((time.perf_counter() - t0) * 1000, 3)

    action = decision["action"]
    # Legacy fields for backwards compatibility
    is_attack = action in ("BLOCK", "REVIEW")
    confidence = decision["ensemble_confidence"]

    return {
        "query": query,
        # New fields
        "action": action,
        "detectors": detector_results,
        "disagreement": decision["disagreement"],
        "ensemble_confidence": confidence,
        "latency_ms": latency_ms,
        # Legacy fields (unchanged contract for existing dashboard code)
        "prediction": int(is_attack),
        "confidence": confidence,
        "verdict": "Suspicious" if is_attack else "Normal",
        "attack_type": classify_attack_type(query) if is_attack else None,
    }


def detect(query: str) -> dict:
    """Legacy single-detector interface.  Now delegates to detect_multi().

    Preserves the original return shape exactly so existing code calling
    ``detect()`` continues to work without changes.
    """
    result = detect_multi(query)
    # Return only the original keys (drop new keys to avoid surprises)
    return {
        "query": result["query"],
        "prediction": result["prediction"],
        "confidence": result["confidence"],
        "verdict": result["verdict"],
        "attack_type": result["attack_type"],
    }
