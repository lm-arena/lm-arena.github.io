#!/usr/bin/env python3
"""
Sync model name choices in .github/workflows/inference.yml from config/models.py.
Run via: make sync-workflow-choices  (also runs automatically via pre-commit hook)
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config.models import get_inference_models

workflow_path = Path(__file__).parent.parent / '.github' / 'workflows' / 'inference.yml'

options = '\n'.join(f'          - {m.name}' for m in get_inference_models())
new_block = f'        options:\n{options}'

workflow_text = workflow_path.read_text()
updated = re.sub(
    r'        options:\n(?:          - \S+\n?)+',
    new_block + '\n',
    workflow_text,
)

if updated == workflow_text:
    print('inference.yml choices are already up to date')
    sys.exit(0)

workflow_path.write_text(updated)
print(f'Updated inference.yml choices ({len(list(get_inference_models()))} models)')
