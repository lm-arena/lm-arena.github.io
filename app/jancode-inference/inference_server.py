"""
Jan-code 4B Inference Server

Uses llama-server wrapper due to llama-cpp-python binding incompatibilities.
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import uvicorn
from shared.llama_server_wrapper import LlamaServerConfig, create_llama_server_app

config = LlamaServerConfig(
    model_id="jan-code-4b",
    display_name="Jan-code 4B",
    owned_by="janhq",
    default_repo="janhq/Jan-code-4b-gguf",
    default_file="Jan-code-4b-Q4_K_M.gguf",
    default_port=8109,
    n_ctx=4096,
    max_concurrent=3,
)

app = create_llama_server_app(config)

if __name__ == "__main__":
    port = int(os.getenv("PORT", str(config.default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
