"""
Validate that ROUTE_MAP in app/tunnel-registry/worker.js matches the
routing_category assignments in config/models.py.

Exits 0 if they match, 1 if they differ or the parse fails.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
WORKER_PATH = REPO_ROOT / "app" / "tunnel-registry" / "worker.js"
CONFIG_PATH = REPO_ROOT / "config" / "models.py"

sys.path.insert(0, str(REPO_ROOT))


def route_map_from_config() -> dict[str, set[str]]:
    from config.models import get_inference_models

    by_category: dict[str, set[str]] = defaultdict(set)
    for model in get_inference_models():
        if model.routing_category:
            by_category[model.routing_category].add(model.name)
    return dict(by_category)


def route_map_from_worker() -> dict[str, set[str]]:
    text = WORKER_PATH.read_text()

    # Match: const ROUTE_MAP = { ... };
    # The block may span multiple lines and contain nested brackets only in
    # array literals, so we match from the opening brace to the first };
    block_match = re.search(
        r"const\s+ROUTE_MAP\s*=\s*(\{[^}]*(?:\[[^\]]*\][^}]*)*\})\s*;",
        text,
        re.DOTALL,
    )
    if not block_match:
        print(
            "ERROR: Could not find ROUTE_MAP constant in "
            f"{WORKER_PATH.relative_to(REPO_ROOT)}",
            file=sys.stderr,
        )
        print(
            "Expected:  const ROUTE_MAP = { ... };",
            file=sys.stderr,
        )
        sys.exit(1)

    block = block_match.group(1)

    # Extract each  key: ['a', 'b', ...]  entry
    result: dict[str, set[str]] = {}
    for entry in re.finditer(
        r"(\w+)\s*:\s*\[([^\]]*)\]",
        block,
    ):
        category = entry.group(1)
        raw_names = entry.group(2)
        names = {n.strip().strip("'\"") for n in raw_names.split(",") if n.strip()}
        result[category] = names

    if not result:
        print(
            "ERROR: ROUTE_MAP was found but no category entries could be parsed.",
            file=sys.stderr,
        )
        sys.exit(1)

    return result


def main() -> None:
    config_map = route_map_from_config()
    worker_map = route_map_from_worker()

    all_categories = sorted(set(config_map) | set(worker_map))
    mismatches: list[str] = []

    for category in all_categories:
        in_config = config_map.get(category, set())
        in_worker = worker_map.get(category, set())

        only_config = in_config - in_worker
        only_worker = in_worker - in_config

        if only_config or only_worker:
            lines = [f"  [{category}]"]
            if only_config:
                lines.append(f"    in config only : {sorted(only_config)}")
            if only_worker:
                lines.append(f"    in worker only : {sorted(only_worker)}")
            mismatches.append("\n".join(lines))

    if mismatches:
        print("ROUTE_MAP drift detected between config/models.py and worker.js:\n")
        for m in mismatches:
            print(m)
        print(
            "\nFix: update app/tunnel-registry/worker.js to match config/models.py, "
            "or run `make sync-worker-config`."
        )
        sys.exit(1)

    print(
        f"OK: ROUTE_MAP in worker.js matches config/models.py "
        f"({len(all_categories)} categories, "
        f"{sum(len(v) for v in config_map.values())} models)"
    )


if __name__ == "__main__":
    main()
