"""
Shared llama-server entry point.

MODEL_NAME env var selects the model from config/models.py.
Used by Dockerfile.llama-server so per-model inference_server.py files are not needed.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import uvicorn
from shared.llama_server_wrapper import create_llama_server_app_for_model
from config.models import get_model

MODEL_NAME = os.environ.get("MODEL_NAME")
if not MODEL_NAME:
    print("ERROR: MODEL_NAME environment variable is required", file=sys.stderr)
    sys.exit(1)

m = get_model(MODEL_NAME)
app = create_llama_server_app_for_model(MODEL_NAME)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", str(m.port))))
