"""
Benchmark runner for lm-arena.

Calls /v1/chat/completions for each online model across three suites
(MMLU, instruction-following, GSM8K), measures latency and throughput.

Modes:
  --list-models          Print JSON array of online model IDs and exit
  --model <id>           Benchmark a single model, write result to /tmp/benchmark-result.json
  --merge <dir>          Merge per-model result files into the final dated JSON + index
  --quality-gate <file>  Exit 1 if no functional models in the results file (for CI)
  (no args)              Sequential: benchmark all online models (local dev)

Writes results to:
  app/chat/frontend/public/benchmarks/YYYY-MM-DD.json   — full run with per-prompt traces
  app/chat/frontend/public/benchmarks/index.json        — list of available runs

Also pushes aggregate metrics to KV via PUT /benchmark/:model for the live page widget.
"""

import argparse
import json
import os
import re
import statistics
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests

REGISTRY    = os.environ.get("REGISTRY", "https://tunnel-registry.jonasneves.workers.dev")
WRITE_KEY   = os.environ.get("TUNNEL_WRITE_KEY", "")
TIMEOUT     = 60
MAX_TOKENS  = 256
OUT_DIR     = Path("app/chat/frontend/public/benchmarks")
RESULT_FILE = Path("/tmp/benchmark-result.json")

# Warmup probe sent before the suites. If it returns empty, the model is skipped.
WARMUP_PROMPT = "Respond with exactly one word: hello."


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
    ("mmlu",     MMLU_PROMPTS,     False),
    ("instruct", INSTRUCT_PROMPTS, True),   # strict = single-word check
    ("gsm8k",    GSM8K_PROMPTS,    False),
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
    """
    Send a single prompt via streaming SSE and return a result dict:
      text       — full response text, or None on request failure
      latency_ms — wall-clock time from request start to stream end
      tps        — completion tokens per second (0 if unavailable)
      timed_out  — True if the request hit the timeout
      error      — error message string, or None
    """
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": MAX_TOKENS,
        "stream": True,
    }
    t0 = time.monotonic()
    try:
        res = requests.post(
            f"{REGISTRY}/v1/chat/completions",
            json=payload,
            timeout=TIMEOUT,
            stream=True,
        )
        res.raise_for_status()

        text = ""
        completion_chunks = 0
        usage_tokens = None

        for raw in res.iter_lines():
            if not raw:
                continue
            line = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
                delta = chunk["choices"][0]["delta"].get("content") or ""
                if delta:
                    text += delta
                    completion_chunks += 1
                if chunk.get("usage") and chunk["usage"].get("completion_tokens"):
                    usage_tokens = chunk["usage"]["completion_tokens"]
            except Exception:
                pass

        latency_ms = (time.monotonic() - t0) * 1000
        if usage_tokens is not None:
            tps = (usage_tokens / (latency_ms / 1000)) if latency_ms > 0 else 0
        elif completion_chunks:
            tps = (completion_chunks / (latency_ms / 1000)) if latency_ms > 0 else 0
        else:
            tps = 0
        tps_label = "tokens/s" if usage_tokens is not None else "chunks/s"
        return {"text": text, "latency_ms": latency_ms, "tps": tps, "tps_label": tps_label, "timed_out": False, "error": None}

    except requests.exceptions.Timeout:
        latency_ms = (time.monotonic() - t0) * 1000
        print(f"  timeout after {latency_ms:.0f}ms")
        return {"text": None, "latency_ms": latency_ms, "tps": 0, "tps_label": "chunks/s", "timed_out": True, "error": "timeout"}

    except Exception as e:
        latency_ms = (time.monotonic() - t0) * 1000
        print(f"  error: {e}")
        return {"text": None, "latency_ms": latency_ms, "tps": 0, "tps_label": "chunks/s", "timed_out": False, "error": str(e)}


def check_model_responsive(model_id):
    """Quick warmup probe. Returns True if the model returns a non-empty response."""
    print(f"  warmup probe...")
    result = run_prompt(model_id, WARMUP_PROMPT)
    text = result.get("text") or ""
    ok = bool(text.strip())
    print(f"  warmup: {'ok' if ok else 'EMPTY — skipping'} ({result['latency_ms']:.0f}ms)")
    return ok


def exact_match(response, expected):
    # Word-boundary match: "6" must not be part of "16" or "60"; "Au" must not be part of "beautiful"
    return bool(re.search(r'\b' + re.escape(expected.lower()) + r'\b', response.lower()))


# ---------------------------------------------------------------------------
# Benchmarking
# ---------------------------------------------------------------------------

def benchmark_model(model_id):
    print(f"\n=== {model_id} ===")

    if not check_model_responsive(model_id):
        return {
            "model": model_id,
            "date": date.today().isoformat(),
            "run_at": datetime.now(timezone.utc).isoformat(),
            "functional": False,
            "suites": {},
            "overall": {"p50_ms": None, "max_ms": None, "avg_tokens_per_sec": None, "tps_label": None},
        }

    all_latencies = []
    all_tps = []
    all_tps_labels = []
    suites_out = {}

    for suite_name, prompts, strict in SUITES:
        traces = []
        suite_latencies = []

        for prompt, expected in prompts:
            result = run_prompt(model_id, prompt)
            text      = result["text"]
            lat       = result["latency_ms"]
            tps       = result["tps"]
            timed_out = result["timed_out"]
            all_tps_labels.append(result["tps_label"])

            responded = text is not None and bool(text.strip())
            correct   = exact_match(text, expected) if responded else False
            if correct and strict and len(text.strip().split()) > 3:
                correct = False

            traces.append({
                "prompt":     prompt,
                "expected":   expected,
                "response":   text,
                "responded":  responded,
                "timed_out":  timed_out,
                "correct":    correct,
                "latency_ms": round(lat, 1) if lat else None,
            })

            if lat:
                suite_latencies.append(lat)
                all_latencies.append(lat)
            if tps > 0:
                all_tps.append(tps)

            status = "timeout" if timed_out else ("empty" if not responded else f"correct={correct}")
            print(f"  [{suite_name}] {lat:.0f}ms  {status}  {str(text or '')[:60]!r}")

        answered      = sum(1 for t in traces if t["responded"])
        correct_count = sum(1 for t in traces if t["correct"])
        suites_out[suite_name] = {
            "prompts":  len(prompts),
            "answered": answered,
            "correct":  correct_count,
            "accuracy": round(correct_count / len(prompts), 3),
            "p50_ms":   round(statistics.median(suite_latencies), 1) if suite_latencies else None,
            "max_ms":   round(max(suite_latencies), 1) if suite_latencies else None,
            "traces":   traces,
        }

    total_prompts   = sum(len(p) for _, p, _ in SUITES)
    total_responded = sum(t["responded"] for s in suites_out.values() for t in s["traces"])
    functional      = (total_responded / total_prompts) > 0.5 if total_prompts else False
    tps_label       = "tokens/s" if all_tps_labels and all(l == "tokens/s" for l in all_tps_labels) else "chunks/s"

    return {
        "model":    model_id,
        "date":     date.today().isoformat(),
        "run_at":   datetime.now(timezone.utc).isoformat(),
        "functional": functional,
        "suites":   suites_out,
        "overall": {
            "p50_ms":            round(statistics.median(all_latencies), 1) if all_latencies else None,
            "max_ms":            round(max(all_latencies), 1) if all_latencies else None,
            "avg_tokens_per_sec": round(statistics.mean(all_tps), 1) if all_tps else None,
            "tps_label":         tps_label,
        },
    }


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def push_to_kv(model_id, metrics):
    if not WRITE_KEY:
        print("  (skipping KV push — TUNNEL_WRITE_KEY not set)")
        return
    payload = {k: v for k, v in metrics.items() if k != "suites"}
    payload["suites"] = {
        name: {k: v for k, v in suite.items() if k != "traces"}
        for name, suite in metrics.get("suites", {}).items()
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


def cmd_quality_gate(results_file):
    """Exit 1 and print a summary if no models in the run are functional."""
    data = json.loads(Path(results_file).read_text())
    total      = len(data)
    functional = [m for m, v in data.items() if v.get("functional", False)]
    non_functional = [m for m in data if m not in functional]

    print(f"Quality gate: {len(functional)}/{total} models functional")
    if non_functional:
        print(f"  not functional: {', '.join(non_functional)}")

    if not functional:
        print("FAILED — no functional models. Data may be unreliable.")
        # Write a warning to step summary if running in GitHub Actions
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a") as f:
                f.write(f"## ⚠️ Quality gate warning\n")
                f.write(f"0/{total} models returned non-empty responses in this run.\n")
                f.write(f"Models: {', '.join(non_functional)}\n")
        raise SystemExit(1)


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
    parser.add_argument("--list-models",   action="store_true", help="Print JSON array of online model IDs")
    parser.add_argument("--model",         metavar="ID",  help="Benchmark a single model")
    parser.add_argument("--merge",         metavar="DIR", help="Merge per-model result files from artifact directory")
    parser.add_argument("--quality-gate",  metavar="FILE", help="Exit 1 if no functional models in results file")
    args = parser.parse_args()

    if args.list_models:
        cmd_list_models()
    elif args.model:
        cmd_single(args.model)
    elif args.merge:
        cmd_merge(args.merge)
    elif args.quality_gate:
        cmd_quality_gate(args.quality_gate)
    else:
        cmd_all()


if __name__ == "__main__":
    main()
