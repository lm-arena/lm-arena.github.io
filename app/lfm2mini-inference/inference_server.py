import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import uvicorn
from shared.llama_server_wrapper import LlamaServerConfig, create_llama_server_app
from config.models import MODELS

m = MODELS["lfm2mini"]

config = LlamaServerConfig(
    model_id=m.model_id,
    display_name=m.display_name,
    owned_by=m.owned_by,
    default_repo=m.hf_repo,
    default_file=m.hf_file,
    default_port=m.port,
    n_ctx=m.n_ctx,
    n_threads=m.n_threads,
    n_batch=m.n_batch,
    max_concurrent=m.max_concurrent,
    flash_attn=m.flash_attn,
    kv_cache_quant=m.kv_cache_quant,
)

app = create_llama_server_app(config)

if __name__ == "__main__":
    port = int(os.getenv("PORT", str(config.default_port)))
    uvicorn.run(app, host="0.0.0.0", port=port)
