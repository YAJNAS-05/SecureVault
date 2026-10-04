"""Ensemble decision layer for SQLInsight.

Takes the outputs of all individual detectors and aggregates them into a
single ``action`` (BLOCK | ALLOW | REVIEW) plus ensemble-level confidence.

Policy (configurable via ENSEMBLE_POLICY in config.py):
  'any'      — ANY detector votes Suspicious  -> BLOCK  (high-security banking default)
  'majority' — >50% of detectors vote Suspicious -> BLOCK

REVIEW is set when detectors disagree (at least one each way).
ALLOW is set when all detectors vote Normal.
"""
from __future__ import annotations

from typing import List


def decide(detector_results: List[dict], policy: str = "any") -> dict:
    """Aggregate individual detector verdicts into an ensemble decision.

    Args:
        detector_results: list of dicts, each with keys:
            name (str), verdict ('Suspicious'|'Normal'), confidence (float),
            and optionally matched_rule (str).
        policy: 'any' (default) or 'majority'.

    Returns:
        dict with keys:
            action       - 'BLOCK' | 'ALLOW' | 'REVIEW'
            ensemble_confidence - float, average confidence of all detectors
            detectors    - the original detector_results list (pass-through)
            disagreement - bool, True when detectors don't unanimously agree
    """
    if not detector_results:
        return {
            "action": "ALLOW",
            "ensemble_confidence": 0.0,
            "detectors": [],
            "disagreement": False,
        }

    suspicious_votes = [d for d in detector_results if d.get("verdict") == "Suspicious"]
    normal_votes = [d for d in detector_results if d.get("verdict") == "Normal"]
    n_total = len(detector_results)
    n_suspicious = len(suspicious_votes)

    # Disagreement = at least one in each camp
    disagreement = n_suspicious > 0 and len(normal_votes) > 0

    # Determine action
    if policy == "majority":
        is_blocked = n_suspicious > (n_total / 2)
    else:  # 'any' — banking context: fail-closed
        is_blocked = n_suspicious > 0

    if is_blocked:
        action = "BLOCK"
    else:
        action = "ALLOW"

    # Mark as REVIEW if detectors disagree (supplementary flag)
    if disagreement:
        action = "REVIEW"  # Override: surface the conflict; SecureBank decides policy

    # Ensemble confidence: average of per-detector confidences
    avg_conf = round(
        sum(d.get("confidence", 0.0) for d in detector_results) / n_total, 4
    )

    return {
        "action": action,
        "ensemble_confidence": avg_conf,
        "detectors": detector_results,
        "disagreement": disagreement,
    }
