"""
Centralized model configuration for lm-arena.

This is the SINGLE SOURCE OF TRUTH for:
- Port mappings
- Model metadata  
- Subdomain configuration
- Model IDs and display names

All other scripts should import from here.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ModelCategory(Enum):
    """Model category for port allocation and grouping."""
    SMALL = "small"
    MEDIUM = "medium"
    REASONING = "reasoning"


@dataclass
class ModelConfig:
    """Configuration for a single model."""
    name: str
    port: int
    category: ModelCategory
    model_id: str | None = None
    display_name: str | None = None
    inference_dir: str | None = None
    description: str | None = None
    rank: int = 99
    default: bool = False
    hf_repo: str | None = None
    hf_file: str | None = None
    owned_by: str | None = None
    chat_format: str | None = None
    workflow_file: str | None = None
    n_ctx: int = 4096
    n_threads: int = 4
    n_batch: int = 256
    max_concurrent: int = 2
    kv_cache_quant: bool = True
    flash_attn: bool = True
    # Routing category for auto-routing (general/coding/reasoning/function_calling)
    routing_category: str | None = None
    # Dockerfile variant: "inference" (llama-cpp-python) or "llama-server" (builds from source)
    dockerfile: str = "inference"
    
    @property
    def service_url(self) -> str:
        """Local development URL."""
        return f"http://localhost:{self.port}"

    @property
    def env_var(self) -> str:
        """Environment variable name for this model's URL."""
        return f"{self.name.upper()}_API_URL"

    @property
    def internal_url(self) -> str:
        """URL for docker-compose internal networking."""
        return f"http://{self.name}:8000"

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization and chat backend config."""
        return {
            "id": self.model_id,
            "name": self.display_name,
            "env": self.env_var,
            "default_url": self.service_url,
            "service": self.name,
            "default": self.default,
            "rank": self.rank,
        }


# =============================================================================
# PORT ALLOCATION SCHEME
# =============================================================================
# 8100-8199 : Small models (< 7B params); also hosts phireasoning (REASONING
#             category, small footprint) at 8111 for resource reasons
# 8200-8299 : Medium models (7B-30B params)
# 8300-8399 : Reasoning/specialty models
# =============================================================================

MODELS: dict[str, ModelConfig] = {
    # Small models (< 7B params)
    "qwen": ModelConfig(
        name="qwen",
        port=8100,
        category=ModelCategory.SMALL,
        model_id="qwen3.5-4b",
        display_name="Qwen3.5 4B",
        inference_dir="qwen-inference",
        description="Multilingual (201 langs), 256K context, thinking mode, Apache 2.0",
        rank=2,
        hf_repo="unsloth/Qwen3.5-4B-GGUF",
        hf_file="Qwen3.5-4B-Q4_K_M.gguf",
        owned_by="qwen",
        routing_category="general",
        dockerfile="llama-server",
    ),
    "smollm3": ModelConfig(
        name="smollm3",
        port=8104,
        category=ModelCategory.SMALL,
        model_id="smollm3-3b",
        display_name="SmolLM3 3B",
        inference_dir="smollm3-inference",
        description="Hybrid reasoning (36.7% AIME), tool-calling (92.3% BFCL), 64K context",
        rank=3,
        hf_repo="unsloth/SmolLM3-3B-GGUF",
        hf_file="SmolLM3-3B-Q4_K_M.gguf",
        owned_by="huggingfacetb",
        n_batch=512,
        max_concurrent=3,
        routing_category="function_calling",
    ),
    "lfm2": ModelConfig(
        name="lfm2",
        port=8105,
        category=ModelCategory.SMALL,
        model_id="lfm2.5-1.2b-instruct",
        display_name="LFM2.5 1.2B",
        inference_dir="lfm2-inference",
        description="Hybrid LFM2 model, 8 languages, edge-optimized with RL tuning",
        rank=4,
        default=True,
        hf_repo="LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
        hf_file="LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
        owned_by="liquidai",
        routing_category="general",
        dockerfile="llama-server",
    ),
    "lfm2mini": ModelConfig(
        name="lfm2mini",
        port=8110,
        category=ModelCategory.SMALL,
        model_id="lfm2-350m",
        display_name="LFM2 350M",
        inference_dir="lfm2mini-inference",
        description="255 tok/s on Jetson, 33ms TTFT, 229MB — fastest model in the arena",
        rank=6,
        hf_repo="unsloth/LFM2-350M-GGUF",
        hf_file="LFM2-350M-Q4_K_M.gguf",
        owned_by="liquidai",
        n_ctx=8192,
        n_batch=512,
        max_concurrent=4,
        routing_category="general",
        dockerfile="llama-server",
    ),
    "lfm2nk": ModelConfig(
        name="lfm2nk",
        port=8113,
        category=ModelCategory.SMALL,
        model_id="lfm2-350m-nk-risk",
        display_name="LFM2 350M NK Risk",
        inference_dir="lfm2mini-inference",
        description="LFM2 350M fine-tuned on GDELT NK military events — geopolitical risk analyst",
        rank=8,
        hf_repo="signal38/lfm2-nk-risk-GGUF",
        hf_file="LFM2-350M-NK-Risk-Q4_K_M.gguf",
        owned_by="signal38",
        n_ctx=8192,
        n_batch=512,
        max_concurrent=4,
        routing_category="general",
        dockerfile="llama-server",
    ),
    "lfm2spatial": ModelConfig(
        name="lfm2spatial",
        port=8112,
        category=ModelCategory.SMALL,
        model_id="lfm2-350m-stepgame",
        display_name="LFM2 350M StepGame",
        inference_dir="lfm2mini-inference",
        description="LFM2 350M fine-tuned on StepGame spatial reasoning (16% \u2192 70% accuracy)",
        rank=7,
        hf_repo="spatialft/LFM2-350M-StepGame-GGUF",
        hf_file="LFM2-350M-StepGame-f16.gguf",
        owned_by="liquidai",
        n_ctx=8192,
        n_batch=512,
        max_concurrent=4,
        routing_category="general",
        dockerfile="llama-server",
    ),
    "phireasoning": ModelConfig(
        name="phireasoning",
        port=8111,
        category=ModelCategory.REASONING,
        model_id="phi-4-mini-reasoning",
        display_name="Phi-4 Mini Reasoning",
        inference_dir="phireasoning-inference",
        description="3.8B matching o1-mini on math, outperforms R1-distill-7B, 128K context",
        rank=4,
        hf_repo="unsloth/Phi-4-mini-reasoning-GGUF",
        hf_file="Phi-4-mini-reasoning-Q4_K_M.gguf",
        owned_by="microsoft",
        n_ctx=8192,
        n_batch=512,
        max_concurrent=3,
        routing_category="reasoning",
    ),
    "lfm2thinking": ModelConfig(
        name="lfm2thinking",
        port=8108,
        category=ModelCategory.SMALL,
        model_id="lfm2.5-1.2b-thinking",
        display_name="LFM2.5 1.2B Thinking",
        inference_dir="lfm2thinking-inference",
        description="Thinking variant of LFM2.5, hybrid architecture with reasoning traces",
        rank=5,
        hf_repo="LiquidAI/LFM2.5-1.2B-Thinking-GGUF",
        hf_file="LFM2.5-1.2B-Thinking-Q4_K_M.gguf",
        owned_by="liquidai",
        kv_cache_quant=False,
        flash_attn=False,
        routing_category="reasoning",
        dockerfile="llama-server",
    ),
    "jancode": ModelConfig(
        name="jancode",
        port=8109,
        category=ModelCategory.SMALL,
        model_id="jan-code-4b",
        display_name="Jan-code 4B",
        inference_dir="jancode-inference",
        description="Code-focused 4B model by Jan, 2.72GB Q4_K_M",
        rank=8,
        hf_repo="janhq/Jan-code-4b-gguf",
        hf_file="Jan-code-4b-Q4_K_M.gguf",
        owned_by="janhq",
        n_batch=512,
        max_concurrent=3,
        routing_category="coding",
        dockerfile="llama-server",
    ),

    # Medium models (7B-30B params)
    "qwen7b": ModelConfig(
        name="qwen7b",
        port=8205,
        category=ModelCategory.MEDIUM,
        model_id="qwen3.5-7b",
        display_name="Qwen3.5 7B",
        inference_dir="qwen7b-inference",
        description="Multilingual (201 langs), 256K context, thinking mode, Apache 2.0",
        rank=8,
        hf_repo="unsloth/Qwen3.5-9B-GGUF",
        hf_file="Qwen3.5-9B-Q4_K_M.gguf",
        owned_by="qwen",
        routing_category="general",
        dockerfile="llama-server",
    ),
    "qwenclaude27b": ModelConfig(
        name="qwenclaude27b",
        port=8206,
        category=ModelCategory.MEDIUM,
        model_id="qwen3.5-27b-claude-distilled",
        display_name="Qwen3.5-27B Claude Distilled",
        inference_dir="qwenclaude27b-inference",
        description="27B reasoning distilled from Claude 4.6 Opus, preserved thinking mode, strong agentic capabilities",
        rank=2,
        hf_repo="Jackrong/Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-GGUF",
        hf_file="Qwen3.5-27B.Q4_K_M.gguf",
        owned_by="jackrong",
        n_ctx=8192,
        max_concurrent=1,
        routing_category="reasoning",
        dockerfile="llama-server",
    ),
    "falcon": ModelConfig(
        name="falcon",
        port=8202,
        category=ModelCategory.MEDIUM,
        model_id="falcon-h1r-7b",
        display_name="Falcon H1R 7B",
        inference_dir="falcon-inference",
        description="Transformer-Mamba hybrid, AIME 88.1%, LiveCodeBench 68.6%, 256K context",
        rank=7,
        hf_repo="unsloth/Falcon-H1R-7B-GGUF",
        hf_file="Falcon-H1R-7B-Q4_K_M.gguf",
        owned_by="tii",
        routing_category="reasoning",
        dockerfile="llama-server",
    ),
    "gemma3n": ModelConfig(
        name="gemma3n",
        port=8204,
        category=ModelCategory.MEDIUM,
        model_id="gemma-3n-e4b-it",
        display_name="Gemma 3n E4B",
        inference_dir="gemma3n-inference",
        description="MatFormer: 8B params, 4B memory footprint, LMArena 1300+ (first sub-10B)",
        rank=5,
        hf_repo="unsloth/gemma-3n-E4B-it-GGUF",
        hf_file="gemma-3n-E4B-it-Q4_K_M.gguf",
        owned_by="google",
        n_ctx=8192,
        n_batch=256,
        max_concurrent=2,
        routing_category="general",
    ),
    # Reasoning models
    "nanbeige": ModelConfig(
        name="nanbeige",
        port=8301,
        category=ModelCategory.REASONING,
        model_id="nanbeige4.1-3b",
        display_name="Nanbeige4.1-3B",
        inference_dir="nanbeige-inference",
        description="AIME 90.4%, GPQA 82.2%, outperforms Qwen3-32B on reasoning",
        rank=1,
        hf_repo="mradermacher/Nanbeige4.1-3B-GGUF",
        hf_file="Nanbeige4.1-3B.Q4_K_M.gguf",
        owned_by="nanbeige",
        n_ctx=2048,
        n_batch=512,
        max_concurrent=4,
        routing_category="reasoning",
    ),
    "gptoss": ModelConfig(
        name="gptoss",
        port=8303,
        category=ModelCategory.REASONING,
        model_id="gpt-oss-20b",
        display_name="GPT-OSS 20B",
        inference_dir="gpt-oss-inference",
        description="MoE (21B params / 3.6B active), function calling, agentic operations",
        rank=13,
        hf_repo="unsloth/gpt-oss-20b-GGUF",
        hf_file="gpt-oss-20b-Q6_K.gguf",
        owned_by="openai",
        workflow_file="inference.yml",
        routing_category="function_calling",
    ),
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_model(name: str) -> ModelConfig:
    """Get model config by name."""
    if name not in MODELS:
        available = ", ".join(MODELS.keys())
        raise KeyError(f"Model '{name}' not found. Available: {available}")
    return MODELS[name]


def get_inference_models() -> list[ModelConfig]:
    """Get all inference models sorted by rank."""
    return sorted(MODELS.values(), key=lambda m: m.rank)


def get_default_model() -> ModelConfig:
    """Get the default model for auto-selection."""
    for m in MODELS.values():
        if m.default:
            return m
    return get_inference_models()[0]



if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) > 1:
        arg = sys.argv[1]

        if arg == "--inference-dirs":
            dirs = [m.inference_dir for m in get_inference_models()]
            print(json.dumps(dirs))
            sys.exit(0)

        if arg == "--inference-names":
            names = [m.name for m in get_inference_models()]
            print(json.dumps(names))
            sys.exit(0)

        if arg == "--services-json":
            services = [
                {
                    "key": m.name,
                    "name": m.display_name,
                    "localPort": m.port,
                    "category": m.category.value,
                    "modelId": m.model_id,
                    "rank": m.rank,
                }
                for m in get_inference_models()
            ]
            print(json.dumps({"services": services}, indent=2))
            sys.exit(0)

        if arg == "--route-map":
            from collections import defaultdict
            route_map: dict[str, list[str]] = defaultdict(list)
            for m in get_inference_models():
                if m.routing_category:
                    route_map[m.routing_category].append(m.name)
            print(json.dumps(dict(route_map), indent=2))
            sys.exit(0)

        # CLI mode: python config/models.py <model_name> [field]
        model_name = arg
        try:
            m = get_model(model_name)
            if len(sys.argv) > 2:
                # Output single field
                field = sys.argv[2]
                value = getattr(m, field, None)
                if value is not None:
                    print(value)
                else:
                    print(f"Unknown field: {field}", file=sys.stderr)
                    sys.exit(1)
            else:
                # Output all config as JSON for workflow parsing
                print(json.dumps({
                    "model_name": m.name,
                    "model_dir": m.inference_dir,
                    "model_repo": m.hf_repo,
                    "model_file": m.hf_file,
                    "display_name": m.display_name,
                    "n_ctx": m.n_ctx,
                    "n_threads": m.n_threads,
                    "n_batch": m.n_batch,
                    "max_concurrent": m.max_concurrent,
                    "kv_cache_quant": m.kv_cache_quant,
                    "flash_attn": m.flash_attn,
                    "dockerfile": m.dockerfile,
                }))
        except KeyError as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)
    else:
        # List mode
        print("Serverless LLM - Model Configuration")
        print("=" * 60)
        for m in get_inference_models():
            print(f"  #{m.rank} {m.display_name:<20} :{m.port}  {m.env_var}")
