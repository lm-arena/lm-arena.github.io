"""
Benchmark runner for lm-arena.

Calls /v1/chat/completions for each online model across three suites
(MMLU, instruction-following, GSM8K), measures latency and throughput.

Modes:
  --list-models          Print JSON array of online model IDs and exit
  --model <id>           Benchmark a single model, write result to /tmp/benchmark-result.json
  --merge <dir>          Merge per-model result files into the final dated JSON + index
  (no args)              Sequential: benchmark all online models (local dev)

Writes results to:
  app/chat/frontend/public/benchmarks/YYYY-MM-DD.json   — full run with per-prompt traces
  app/chat/frontend/public/benchmarks/index.json        — list of available runs

Also pushes aggregate metrics to KV via PUT /benchmark/:model for the live page widget.
"""

import argparse
import json
import os
import statistics
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

REGISTRY   = os.environ.get("REGISTRY", "https://tunnel-registry.jonasneves.workers.dev")
WRITE_KEY  = os.environ.get("TUNNEL_WRITE_KEY", "")
TIMEOUT    = 60
MAX_TOKENS = 256
OUT_DIR    = Path("app/chat/frontend/public/benchmarks")
RESULT_FILE = Path("/tmp/benchmark-result.json")


# ---------------------------------------------------------------------------
# Prompt suites
# ---------------------------------------------------------------------------

# Each entry: (prompt, expected_substring)
MMLU_PROMPTS = [
    ("What is the chemical symbol for gold?", "Au"),
    ("Which planet is closest to the Sun?", "Mercury"),
    ("What is the square root of 144?", "12"),
    ("Who wrote Romeo and Juliet?", "Shakespeare"),
    ("What is the capital of France?", "Paris"),
    ("How many sides does a hexagon have?", "6"),
    ("What gas do plants absorb from the atmosphere?", "CO2"),
    ("In what year did World War II end?", "1945"),
    ("What is the boiling point of water in Celsius?", "100"),
    ("How many bones are in the adult human body?", "206"),
]

# Instruction-following: model must respond with exactly the requested word/phrase.
# Expected is the exact string the response must contain (case-insensitive).
INSTRUCT_PROMPTS = [
    ("Respond with exactly one word: the color of the sky.", "blue"),
    ("Respond with exactly one word: the opposite of hot.", "cold"),
    ("Respond with exactly one word: the first month of the year.", "january"),
    ("Respond with exactly one word: the number of days in a week.", "7"),
    ("Respond with exactly one word: what is 2 + 2?", "4"),
    ("Respond with exactly one word: what metal is used in electrical wires?", "copper"),
    ("Respond with exactly one word: the largest ocean.", "pacific"),
    ("Respond with exactly one word: what do bees produce?", "honey"),
]

GSM8K_PROMPTS = [
    ("If a train travels 60 km/h for 2 hours, how many km does it travel? Answer with the number only.", "120"),
    ("A store sells 3 apples for $2. How much do 9 apples cost? Answer with the number only.", "6"),
    ("There are 24 students in a class. 1/3 are absent. How many are present? Answer with the number only.", "16"),
    ("A rectangle has length 8 and width 5. What is its area? Answer with the number only.", "40"),
    ("If 5 workers finish a job in 10 days, how many days for 10 workers? Answer with the number only.", "5"),
]

SUITES = [
    ("mmlu",     MMLU_PROMPTS),
    ("instruct", INSTRUCT_PROMPTS),
    ("gsm8k",    GSM8K_PROMPTS),
]


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def get_online_models():
    try:
        res = requests.get(f"{REGISTRY}/v1/models", timeout=10)
        res.raise_for_status()
        return [m["id"] for m in res.json().get("data", [])]
    except Exception as e:
        print(f"Failed to fetch models: {e}")
        return []


def run_prompt(model_id, prompt):
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": MAX_TOKENS,
        "stream": False,
    }
    t0 = time.monotonic()
    try:
        res = requests.post(
            f"{REGISTRY}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT,
        )
        latency_ms = (time.monotonic() - t0) * 1000
        res.raise_for_status()
        data = res.json()
        text = data["choices"][0]["message"]["content"]
        completion_tokens = data.get("usage", {}).get("completion_tokens", 0)
        tps = (completion_tokens / (latency_ms / 1000)) if latency_ms > 0 and completion_tokens else 0
        return text, latency_ms, tps
    except Exception as e:
        print(f"  error: {e}")
        return None


def exact_match(response, expected):
    return expected.lower() in response.lower()


# ---------------------------------------------------------------------------
# Benchmarking
# ---------------------------------------------------------------------------

def benchmark_model(model_id):
    print(f"\n=== {model_id} ===")
    all_latencies = []
    all_tps = []
    suites_out = {}

    for suite_name, prompts in SUITES:
        traces = []
        suite_latencies = []

        for prompt, expected in prompts:
            result = run_prompt(model_id, prompt)
            if result is None:
                traces.append({
                    "prompt": prompt,
                    "expected": expected,
                    "response": None,
                    "correct": False,
                    "latency_ms": None,
                })
                continue

            text, lat, tps = result
            correct = exact_match(text, expected)
            traces.append({
                "prompt": prompt,
                "expected": expected,
                "response": text,
                "correct": correct,
                "latency_ms": round(lat, 1),
            })
            suite_latencies.append(lat)
            all_latencies.append(lat)
            if tps > 0:
                all_tps.append(tps)

            print(f"  [{suite_name}] {lat:.0f}ms  correct={correct}  response={text[:60]!r}")

        answered = len(suite_latencies)
        correct_count = sum(1 for t in traces if t["correct"])
        suites_out[suite_name] = {
            "prompts": len(prompts),
            "answered": answered,
            "correct": correct_count,
            "accuracy": round(correct_count / answered, 3) if answered else 0,
            "p50_ms": round(statistics.median(suite_latencies), 1) if suite_latencies else None,
            "p95_ms": round(sorted(suite_latencies)[int(len(suite_latencies) * 0.95)], 1) if len(suite_latencies) >= 2 else None,
            "traces": traces,
        }

    return {
        "model": model_id,
        "date": date.today().isoformat(),
        "run_at": datetime.now(timezone.utc).isoformat(),
        "suites": suites_out,
        "overall": {
            "p50_ms": round(statistics.median(all_latencies), 1) if all_latencies else None,
            "p95_ms": round(sorted(all_latencies)[int(len(all_latencies) * 0.95)], 1) if len(all_latencies) >= 2 else None,
            "avg_tokens_per_sec": round(statistics.mean(all_tps), 1) if all_tps else None,
        },
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def push_to_kv(model_id, metrics):
    if not WRITE_KEY:
        print("  (skipping KV push — TUNNEL_WRITE_KEY not set)")
        return
    # Push aggregate only (no traces) to KV
    payload = {k: v for k, v in metrics.items() if k != "suites"}
    payload["suites"] = {
        name: {k: v for k, v in suite.items() if k != "traces"}
        for name, suite in metrics["suites"].items()
    }
    try:
        res = requests.put(
            f"{REGISTRY}/benchmark/{model_id}",
            data=json.dumps(payload),
            headers={"Authorization": f"Bearer {WRITE_KEY}", "Content-Type": "application/json"},
            timeout=10,
        )
        res.raise_for_status()
        print(f"  pushed to KV: {model_id}")
    except Exception as e:
        print(f"  KV push failed: {e}")


def write_results(today, all_results):
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    run_file = OUT_DIR / f"{today}.json"
    existing = {}
    if run_file.exists():
        try:
            existing = json.loads(run_file.read_text())
        except Exception:
            pass
    existing.update(all_results)
    run_file.write_text(json.dumps(existing, indent=2))
    print(f"\nResults written to {run_file} ({len(existing)} models total)")

    index_file = OUT_DIR / "index.json"
    runs = []
    if index_file.exists():
        try:
            runs = json.loads(index_file.read_text())
        except Exception:
            runs = []

    if today not in runs:
        runs.insert(0, today)
    index_file.write_text(json.dumps(runs, indent=2))
    print(f"Index updated: {runs[:5]}{'...' if len(runs) > 5 else ''}")


# ---------------------------------------------------------------------------
# CLI modes
# ---------------------------------------------------------------------------

def cmd_list_models():
    models = get_online_models()
    print(json.dumps(models))


def cmd_single(model_id):
    metrics = benchmark_model(model_id)
    push_to_kv(model_id, metrics)
    RESULT_FILE.write_text(json.dumps({"model_id": model_id, "metrics": metrics}))
    print(f"Result written to {RESULT_FILE}")


def cmd_merge(results_dir):
    """Merge per-model result files uploaded as artifacts into a single dated JSON."""
    today = date.today().isoformat()
    all_results = {}
    for f in sorted(Path(results_dir).glob("*/benchmark-result.json")):
        data = json.loads(f.read_text())
        all_results[data["model_id"]] = data["metrics"]
        print(f"  merged: {data['model_id']}")
    if not all_results:
        print("No results to merge — exiting.")
        return
    write_results(today, all_results)


def cmd_all():
    models = get_online_models()
    if not models:
        print("No models online — exiting.")
        return
    print(f"Online models: {models}")
    today = date.today().isoformat()
    all_results = {}
    for model_id in models:
        metrics = benchmark_model(model_id)
        all_results[model_id] = metrics
        push_to_kv(model_id, metrics)
    write_results(today, all_results)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--list-models", action="store_true", help="Print JSON array of online model IDs")
    parser.add_argument("--model", metavar="ID", help="Benchmark a single model")
    parser.add_argument("--merge", metavar="DIR", help="Merge per-model result files from artifact directory")
    args = parser.parse_args()

    if args.list_models:
        cmd_list_models()
    elif args.model:
        cmd_single(args.model)
    elif args.merge:
        cmd_merge(args.merge)
    else:
        cmd_all()


if __name__ == "__main__":
    main()
