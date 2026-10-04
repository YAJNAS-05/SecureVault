"""Offline evaluation script for a Red-Team session.

Fetches a labeled session from the SQLInsight SQLite database and computes
per-detector and ensemble metrics (TP/FP/FN/TN, precision, recall, F1).

Usage:
    python ml/evaluate_session.py --session <session_id>
    python ml/evaluate_session.py --session <session_id> --output results.json

If --session is omitted, lists all sessions with labeled events.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import database  # noqa: E402 (backend module)


def _pct(v: float) -> str:
    return f"{v:.2f}%"


def _print_metrics(name: str, m: dict) -> None:
    print(f"\n  [{name}]")
    print(f"    Accuracy:  {_pct(m['accuracy'])}  |  F1: {_pct(m['f1'])}")
    print(f"    Precision: {_pct(m['precision'])}  |  Recall: {_pct(m['recall'])}")
    print(f"    TP={m['tp']}  FP={m['fp']}  FN={m['fn']}  TN={m['tn']}")


def cmd_evaluate(session_id: str, output: str | None) -> None:
    result = database.get_session(session_id)

    if result["labeled_events"] == 0:
        print(f"Session '{session_id}' has no labeled events.")
        print("Use POST /api/evaluate with expected_verdict to label events.")
        return

    print(f"\n{'='*60}")
    print(f"Session: {session_id}")
    print(f"Labeled events: {result['labeled_events']}")
    print(f"Missed attacks (FN): {result['missed_attacks_count']}")
    print(f"{'='*60}")
    print("\nEnsemble:")
    _print_metrics("ensemble", result["ensemble"])
    print("\nPer-detector:")
    for name, m in result["detectors"].items():
        _print_metrics(name, m)

    if result.get("missed_attacks_sample"):
        print(f"\nSample of missed attacks (first {len(result['missed_attacks_sample'])}):")
        for missed in result["missed_attacks_sample"]:
            print(f"  action={missed['action']}  expected={missed['expected']}")

    if output:
        Path(output).write_text(json.dumps(result, indent=2))
        print(f"\nSaved to {output}")


def cmd_list() -> None:
    sessions = database.list_sessions()
    if not sessions:
        print("No sessions found. Sessions are created when requests include a session_id.")
        return

    print(f"\n{'Session ID':<40} {'Total':>6} {'Attacks':>8} {'Labeled':>8} {'Last seen'}")
    print("-" * 80)
    for s in sessions:
        print(
            f"{s['session_id']:<40} {s['total']:>6} {s['attacks']:>8} {s.get('labeled', 0):>8} "
            f"{s['last_seen']}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="SQLInsight offline session evaluator")
    parser.add_argument("--session", help="Session ID to evaluate")
    parser.add_argument("--output", help="Write results to this JSON file")
    args = parser.parse_args()

    # Need to import backend database module; add backend dir to sys.path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

    if args.session:
        cmd_evaluate(args.session, args.output)
    else:
        print("No --session specified. Listing all sessions:\n")
        cmd_list()


if __name__ == "__main__":
    main()
