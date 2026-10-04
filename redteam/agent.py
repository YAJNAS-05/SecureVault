"""
Red-Team Attack Agent for SQLInsight evaluation.

Sends a curated library of labeled payloads (SQLi attacks + benign inputs)
to POST /api/evaluate and measures how well the detection engine performs.

Usage:
    python redteam/agent.py
    python redteam/agent.py --session my-run-01
    python redteam/agent.py --session my-run-01 --url http://localhost:5000
    python redteam/agent.py --list-payloads
    python redteam/agent.py --category "Union-based"
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("[ERROR] requests not installed. Run: pip install requests")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────
#  Payload Library — 45 labeled payloads across 9 categories
# ─────────────────────────────────────────────────────────────
PAYLOADS = [
    # ── Tautology / Auth Bypass ──────────────────────────────
    {"query": "admin' OR '1'='1",           "expected": "Suspicious", "category": "Tautology / Auth Bypass"},
    {"query": "admin' OR '1'='1' --",        "expected": "Suspicious", "category": "Tautology / Auth Bypass"},
    {"query": "' OR 1=1 --",                 "expected": "Suspicious", "category": "Tautology / Auth Bypass"},
    {"query": "' OR 'x'='x",                "expected": "Suspicious", "category": "Tautology / Auth Bypass"},
    {"query": "1' OR '1'='1'/*",            "expected": "Suspicious", "category": "Tautology / Auth Bypass"},
    {"query": "admin'--",                    "expected": "Suspicious", "category": "Tautology / Auth Bypass"},
    {"query": "' OR 1=1#",                   "expected": "Suspicious", "category": "Tautology / Auth Bypass"},

    # ── Union-based ──────────────────────────────────────────
    {"query": "1' UNION SELECT null,null --",             "expected": "Suspicious", "category": "Union-based"},
    {"query": "1 UNION SELECT username,password FROM users","expected": "Suspicious", "category": "Union-based"},
    {"query": "1' UNION ALL SELECT null,table_name FROM information_schema.tables--",
                                                           "expected": "Suspicious", "category": "Union-based"},
    {"query": "0 UNION SELECT 1,2,3,4,5",                "expected": "Suspicious", "category": "Union-based"},
    {"query": "' UNION SELECT null,null,null,null--",     "expected": "Suspicious", "category": "Union-based"},

    # ── Stacked Queries ──────────────────────────────────────
    {"query": "1; DROP TABLE users--",                    "expected": "Suspicious", "category": "Stacked Queries"},
    {"query": "'; INSERT INTO logs VALUES('hacked')--",   "expected": "Suspicious", "category": "Stacked Queries"},
    {"query": "1; UPDATE users SET password='pwned'--",   "expected": "Suspicious", "category": "Stacked Queries"},
    {"query": "'; DELETE FROM sessions WHERE 1=1--",      "expected": "Suspicious", "category": "Stacked Queries"},

    # ── Time-based Blind ─────────────────────────────────────
    {"query": "1' AND SLEEP(5)--",                        "expected": "Suspicious", "category": "Time-based Blind"},
    {"query": "'; WAITFOR DELAY '0:0:5'--",               "expected": "Suspicious", "category": "Time-based Blind"},
    {"query": "1 AND pg_sleep(10)--",                     "expected": "Suspicious", "category": "Time-based Blind"},
    {"query": "1' AND BENCHMARK(5000000,MD5('a'))--",     "expected": "Suspicious", "category": "Time-based Blind"},

    # ── Error-based ──────────────────────────────────────────
    {"query": "1 AND extractvalue(1,concat(0x7e,version()))",  "expected": "Suspicious", "category": "Error-based"},
    {"query": "1' AND updatexml(1,concat(0x7e,user()),1)--",   "expected": "Suspicious", "category": "Error-based"},
    {"query": "1 AND convert(int,(SELECT TOP 1 table_name FROM information_schema.tables))",
                                                                "expected": "Suspicious", "category": "Error-based"},

    # ── Command Execution ────────────────────────────────────
    {"query": "'; EXEC xp_cmdshell('whoami')--",          "expected": "Suspicious", "category": "Command Execution"},
    {"query": "'; EXEC sp_executesql N'SELECT 1'--",       "expected": "Suspicious", "category": "Command Execution"},
    {"query": "1; exec('xp_'+'cmdshell'+'(''dir'')')--",  "expected": "Suspicious", "category": "Command Execution"},

    # ── Schema Enumeration ───────────────────────────────────
    {"query": "1 AND 1=1 UNION SELECT table_name FROM information_schema.tables--",
                                                           "expected": "Suspicious", "category": "Schema Enumeration"},
    {"query": "' UNION SELECT column_name FROM information_schema.columns--",
                                                           "expected": "Suspicious", "category": "Schema Enumeration"},
    {"query": "SELECT * FROM sys.tables",                  "expected": "Suspicious", "category": "Schema Enumeration"},

    # ── Comment Injection ────────────────────────────────────
    {"query": "admin'--",                                  "expected": "Suspicious", "category": "Comment Injection"},
    {"query": "1 /*comment*/ OR /*comment*/ 1=1",          "expected": "Suspicious", "category": "Comment Injection"},
    {"query": "admin' #comment",                           "expected": "Suspicious", "category": "Comment Injection"},

    # ── Generic / Obfuscated ─────────────────────────────────
    {"query": "1' aND '1'='1",                             "expected": "Suspicious", "category": "Generic / Obfuscated"},
    {"query": "1' /*!UNION*/ SELECT null--",               "expected": "Suspicious", "category": "Generic / Obfuscated"},
    {"query": "%27 OR %271%27%3D%271",                     "expected": "Suspicious", "category": "Generic / Obfuscated"},

    # ── Benign / Normal inputs ───────────────────────────────
    {"query": "john_doe_2024",                             "expected": "Normal",     "category": "Benign"},
    {"query": "blue running shoes size 10",                "expected": "Normal",     "category": "Benign"},
    {"query": "best restaurants near me",                  "expected": "Normal",     "category": "Benign"},
    {"query": "select a good book for summer reading",     "expected": "Normal",     "category": "Benign"},
    {"query": "track my order from friday",                "expected": "Normal",     "category": "Benign"},
    {"query": "reset my password please",                  "expected": "Normal",     "category": "Benign"},
    {"query": "transfer $500 to savings account",          "expected": "Normal",     "category": "Benign"},
    {"query": "show me my last 5 transactions",            "expected": "Normal",     "category": "Benign"},
    {"query": "Jane Smith account number 4532",            "expected": "Normal",     "category": "Benign"},
    {"query": "update my email address to user@bank.com",  "expected": "Normal",     "category": "Benign"},
]


# ─────────────────────────────────────────────────────────────
#  Color helpers (ANSI — works in Windows Terminal)
# ─────────────────────────────────────────────────────────────
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def col(text, *codes):
    return "".join(codes) + str(text) + RESET


# ─────────────────────────────────────────────────────────────
#  Agent
# ─────────────────────────────────────────────────────────────

def run_agent(base_url: str, session_id: str, category_filter: str | None, delay: float):
    payloads = PAYLOADS
    if category_filter:
        payloads = [p for p in payloads if p["category"].lower() == category_filter.lower()]
        if not payloads:
            print(f"No payloads for category '{category_filter}'. Use --list-payloads to see categories.")
            return

    total      = len(payloads)
    correct    = 0
    tp = fp = fn = tn = 0
    missed     = []
    results    = []

    print(f"\n{col('SQLInsight Red-Team Agent', BOLD, CYAN)}")
    print(f"  Target  : {base_url}")
    print(f"  Session : {session_id}")
    print(f"  Payloads: {total}  ({sum(1 for p in payloads if p['expected']=='Suspicious')} attacks, "
          f"{sum(1 for p in payloads if p['expected']=='Normal')} benign)")
    print("─" * 70)
    print(f"  {'#':<4} {'Category':<26} {'Expected':<12} {'Got':<8} {'Action':<8} {'OK'}")
    print("─" * 70)

    for i, payload in enumerate(payloads, 1):
        query    = payload["query"]
        expected = payload["expected"]
        category = payload["category"]

        try:
            resp = requests.post(
                f"{base_url}/api/evaluate",
                json={
                    "query":            query,
                    "expected_verdict": expected,
                    "session_id":       session_id,
                    "source":           "redteam",
                    "endpoint":         f"/bank/{category.lower().replace(' ','-')}",
                },
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.ConnectionError:
            print(f"\n{col('ERROR', RED, BOLD)}: Cannot reach {base_url}. Is SQLInsight running?")
            sys.exit(1)
        except Exception as e:
            print(f"  [{i}] Error: {e}")
            continue

        actual    = data.get("verdict", "Normal")
        action    = data.get("action", "ALLOW")
        is_correct = data.get("correct", actual == expected)
        latency    = data.get("latency_ms", 0)

        if is_correct:
            correct += 1
        else:
            missed.append({"query": query, "expected": expected, "got": actual, "action": action, "category": category})

        # Confusion
        if expected == "Suspicious" and actual == "Suspicious": tp += 1
        elif expected == "Normal"    and actual == "Suspicious": fp += 1
        elif expected == "Suspicious" and actual == "Normal":    fn += 1
        else:                                                     tn += 1

        tick     = col("✓", GREEN, BOLD) if is_correct else col("✗", RED, BOLD)
        act_col  = col(action, RED) if action == "BLOCK" else col(action, GREEN) if action == "ALLOW" else col(action, YELLOW)
        exp_col  = col(expected, RED if expected=="Suspicious" else GREEN)
        got_col  = col(actual,   RED if actual=="Suspicious"   else GREEN)

        print(f"  {i:<4} {category:<26} {exp_col:<20} {got_col:<16} {act_col:<16} {tick}  {col(f'{latency:.0f}ms', DIM)}")

        results.append({**payload, "actual": actual, "action": action, "correct": is_correct, "latency_ms": latency})

        if delay > 0:
            time.sleep(delay)

    # ── Summary ──────────────────────────────────────────────
    print("─" * 70)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy  = (tp + tn) / total if total > 0 else 0

    print(f"\n{col('RESULTS', BOLD, CYAN)}  (session: {session_id})")
    print(f"  Total payloads  : {total}")
    print(f"  Correct         : {col(correct, GREEN, BOLD)} / {total}  ({col(f'{100*correct/total:.1f}%', BOLD)})")
    print(f"  Missed attacks  : {col(fn, RED, BOLD)} (False Negatives)")
    print(f"  False alarms    : {col(fp, YELLOW, BOLD)} (False Positives)")
    print()
    print(f"  Accuracy        : {col(f'{accuracy*100:.2f}%', BOLD)}")
    print(f"  Precision       : {col(f'{precision*100:.2f}%', BOLD)}")
    print(f"  Recall          : {col(f'{recall*100:.2f}%', BOLD)}")
    print(f"  F1 Score        : {col(f'{f1*100:.2f}%', BOLD)}")
    print(f"  TP={tp}  FP={fp}  FN={fn}  TN={tn}")

    if missed:
        print(f"\n{col('MISSED ATTACKS', RED, BOLD)} ({len(missed)}):")
        for m in missed:
            print(f"  [{m['category']}] {m['query'][:60]}")

    # Fetch server-side session metrics (per-detector breakdown)
    print(f"\n{col('Fetching per-detector breakdown from server...', DIM)}")
    try:
        session_data = requests.get(f"{base_url}/api/sessions/{session_id}", timeout=5).json()
        dets = session_data.get("detectors", {})
        if dets:
            print(f"\n  {'Detector':<14} {'Accuracy':>10} {'Precision':>10} {'Recall':>10} {'F1':>10}")
            print(f"  {'─'*14} {'─'*10} {'─'*10} {'─'*10} {'─'*10}")
            for name, m in dets.items():
                print(f"  {name:<14} {m['accuracy']:>9.1f}% {m['precision']:>9.1f}% {m['recall']:>9.1f}% {m['f1']:>9.1f}%")
            ens = session_data.get("ensemble", {})
            if ens:
                print(f"  {'ensemble':<14} {ens.get('accuracy',0):>9.1f}% {ens.get('precision',0):>9.1f}% {ens.get('recall',0):>9.1f}% {ens.get('f1',0):>9.1f}%")
    except Exception as e:
        print(f"  Could not fetch session detail: {e}")

    # Save results
    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(exist_ok=True)
    ts_str  = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = out_dir / f"session_{session_id.replace('/', '-')}_{ts_str}.json"
    out_file.write_text(json.dumps({
        "session_id": session_id,
        "timestamp":  ts_str,
        "total":      total,
        "correct":    correct,
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "accuracy":   round(accuracy * 100, 2),
        "precision":  round(precision * 100, 2),
        "recall":     round(recall * 100, 2),
        "f1":         round(f1 * 100, 2),
        "results":    results,
        "missed":     missed,
    }, indent=2))
    print(f"\n  Results saved to: {out_file}")
    print(f"\n  View in dashboard: {base_url}/  →  Session Evaluation panel  →  {session_id}")


def list_payloads():
    from collections import Counter
    cats = Counter(p["category"] for p in PAYLOADS)
    print(f"\n{col('Payload Library', BOLD, CYAN)}  ({len(PAYLOADS)} total)\n")
    for cat, count in sorted(cats.items()):
        label_color = RED if cat != "Benign" else GREEN
        print(f"  {col(f'{count:>3}', BOLD)}  {col(cat, label_color)}")
    print()


# ─────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SQLInsight Red-Team Attack Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python redteam/agent.py
  python redteam/agent.py --session pentest-run-01
  python redteam/agent.py --category "Union-based"
  python redteam/agent.py --list-payloads
  python redteam/agent.py --delay 0.1
        """
    )
    parser.add_argument("--url",            default="http://127.0.0.1:5000", help="SQLInsight base URL")
    parser.add_argument("--session",        default=f"redteam-{datetime.now().strftime('%H%M%S')}", help="Session ID")
    parser.add_argument("--category",       default=None, help="Filter by attack category")
    parser.add_argument("--delay",          type=float, default=0.0, help="Delay between requests (seconds)")
    parser.add_argument("--list-payloads",  action="store_true", help="List all payload categories and exit")
    args = parser.parse_args()

    if args.list_payloads:
        list_payloads()
        return

    run_agent(args.url, args.session, args.category, args.delay)


if __name__ == "__main__":
    main()
