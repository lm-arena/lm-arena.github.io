"""
Benchmark runner for lm-arena.

Calls /v1/chat/completions for each online model across three prompt suites
(MMLU, HumanEval, GSM8K), measures latency and throughput, writes results to
benchmarks/YYYY-MM-DD.json and pushes metrics to KV via PUT /benchmark/:model.
"""

import json
import os
import re
import statistics
import time
from datetime import date
from pathlib import Path

import requests

REGISTRY = os.environ.get("REGISTRY", "https://tunnel-registry.jonasneves.workers.dev")
WRITE_KEY = os.environ.get("TUNNEL_WRITE_KEY", "")
TIMEOUT = 60  # seconds per request
MAX_TOKENS = 256


# ---------------------------------------------------------------------------
# Prompt suites
# ---------------------------------------------------------------------------

MMLU_PROMPTS = [
    ("What is the chemical symbol for gold?", "Au"),
    ("Which planet is closest to the Sun?", "Mercury"),
    ("What is the square root of 144?", "12"),
    ("Who wrote 'Romeo and Juliet'?", "Shakespeare"),
    ("What is the capital of France?", "Paris"),
    ("How many sides does a hexagon have?", "6"),
    ("What gas do plants absorb from the atmosphere?", "CO2"),
    ("In what year did World War II end?", "1945"),
    ("What is the boiling point of water in Celsius?", "100"),
    ("How many bones are in the adult human body?", "206"),
]

HUMANEVAL_PROMPTS = [
    (
        "Write a Python function that returns the sum of two integers.",
        "def",  # just check code was produced
    ),
    (
        "Write a Python function to check if a string is a palindrome.",
        "def",
    ),
    (
        "Write a Python one-liner to flatten a list of lists.",
        "[",
    ),
    (
        "Write a Python function that returns the factorial of n.",
        "def",
    ),
    (
        "Write a Python function that finds the maximum element in a list.",
        "def",
    ),
]

GSM8K_PROMPTS = [
    ("If a train travels 60 km/h for 2 hours, how many km does it travel?", "120"),
    ("A store sells 3 apples for $2. How much do 9 apples cost?", "6"),
    ("There are 24 students in a class. 1/3 are absent. How many are present?", "16"),
    ("A rectangle has length 8 and width 5. What is its area?", "40"),
    ("If 5 workers finish a job in 10 days, how many days for 10 workers?", "5"),
]


def get_online_models():
    """Return list of model IDs currently online."""
    try:
        res = requests.get(f"{REGISTRY}/v1/models", timeout=10)
        res.raise_for_status()
        return [m["id"] for m in res.json().get("data", [])]
    except Exception as e:
        print(f"Failed to fetch models: {e}")
        return []


def run_prompt(model_id, prompt, max_tokens=MAX_TOKENS):
    """Send a single prompt; return (response_text, latency_ms, tokens_per_sec) or None on failure."""
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
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
        print(f"  Error: {e}")
        return None


def exact_match(response, expected):
    """Check if expected answer appears in the response (case-insensitive)."""
    return expected.lower() in response.lower()


def benchmark_model(model_id):
    """Run all prompt suites against one model; return metrics dict."""
    print(f"\n=== {model_id} ===")
    latencies = []
    tps_list = []
    results_by_suite = {}

    suites = [
        ("mmlu",      MMLU_PROMPTS),
        ("humaneval", HUMANEVAL_PROMPTS),
        ("gsm8k",     GSM8K_PROMPTS),
    ]

    for suite_name, prompts in suites:
        correct = 0
        suite_latencies = []

        for prompt, expected in prompts:
            result = run_prompt(model_id, prompt)
            if result is None:
                continue
            text, lat, tps = result
            suite_latencies.append(lat)
            latencies.append(lat)
            if tps > 0:
                tps_list.append(tps)
            if exact_match(text, expected):
                correct += 1
            print(f"  [{suite_name}] {lat:.0f}ms  correct={exact_match(text, expected)}")

        n = len(prompts)
        results_by_suite[suite_name] = {
            "prompts": n,
            "answered": len(suite_latencies),
            "correct": correct,
            "accuracy": round(correct / len(suite_latencies), 3) if suite_latencies else 0,
            "p50_ms": round(statistics.median(suite_latencies), 1) if suite_latencies else None,
            "p95_ms": round(sorted(suite_latencies)[int(len(suite_latencies) * 0.95)], 1) if len(suite_latencies) >= 2 else None,
        }

    return {
        "model": model_id,
        "date": date.today().isoformat(),
        "suites": results_by_suite,
        "overall": {
            "p50_ms": round(statistics.median(latencies), 1) if latencies else None,
            "p95_ms": round(sorted(latencies)[int(len(latencies) * 0.95)], 1) if len(latencies) >= 2 else None,
            "avg_tokens_per_sec": round(statistics.mean(tps_list), 1) if tps_list else None,
        },
    }


def push_to_kv(model_id, metrics):
    """Write benchmark results to KV via the Worker."""
    if not WRITE_KEY:
        print("  (skipping KV push — TUNNEL_WRITE_KEY not set)")
        return
    try:
        res = requests.put(
            f"{REGISTRY}/benchmark/{model_id}",
            data=json.dumps(metrics),
            headers={"Authorization": f"Bearer {WRITE_KEY}", "Content-Type": "application/json"},
            timeout=10,
        )
        res.raise_for_status()
        print(f"  Pushed to KV: {model_id}")
    except Exception as e:
        print(f"  KV push failed: {e}")


def main():
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

    out_path = Path("benchmarks") / f"{today}.json"
    out_path.parent.mkdir(exist_ok=True)
    out_path.write_text(json.dumps(all_results, indent=2))
    print(f"\nResults written to {out_path}")


if __name__ == "__main__":
    main()
