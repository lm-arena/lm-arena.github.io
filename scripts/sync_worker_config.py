#!/usr/bin/env python3
"""
Sync ROUTE_MAP in app/tunnel-registry/worker.js from config/models.py.
Run via: make sync-worker-config
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config.models import get_inference_models

worker_path = Path(__file__).parent.parent / 'app' / 'tunnel-registry' / 'worker.js'

route_map: dict[str, list[str]] = defaultdict(list)
for m in get_inference_models():
    if m.routing_category:
        route_map[m.routing_category].append(m.name)

lines = [
    'const ROUTE_MAP = {',
    *[f"  {cat}:{' ' * (16 - len(cat))}[{', '.join(repr(k) for k in keys)}],"
      for cat, keys in route_map.items()],
    '};',
]
new_block = '\n'.join(lines)

worker_text = worker_path.read_text()
updated = re.sub(
    r'const ROUTE_MAP = \{[\s\S]*?\};',
    new_block,
    worker_text,
)

if updated == worker_text:
    print('worker.js ROUTE_MAP is already up to date')
    sys.exit(0)

worker_path.write_text(updated)
print(f'Updated ROUTE_MAP in worker.js ({sum(len(v) for v in route_map.values())} models across {len(route_map)} categories)')
