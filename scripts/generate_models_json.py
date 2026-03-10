#!/usr/bin/env python3
"""
Generate static models.json for frontend fallback
Reads from config/models.py (single source of truth)
"""

import json
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.models import get_inference_models

def main():
    models = get_inference_models()

    # Transform to frontend format
    local_models = [
        {
            "id": m.model_id,
            "key": m.name,
            "name": m.display_name,
            "type": "self-hosted",
            "priority": m.rank,
            "context_length": m.n_ctx,
        }
        for m in models
    ]

    output = {
        "models": local_models,
        "source": "config/models.py"
    }

    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    main()
