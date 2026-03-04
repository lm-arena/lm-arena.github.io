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
    CORE = "core"
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
# 8080      : Chat Interface (main app)
# 8081-8089 : Reserved for core services
# 8100-8199 : Small models (< 7B params)
# 8200-8299 : Medium models (7B-30B params)  
# 8300-8399 : Reasoning/specialty models
# =============================================================================

MODELS: dict[str, ModelConfig] = {
    # Core services
    "chat": ModelConfig(
        name="chat",
        port=8080,
        category=ModelCategory.CORE,
        inference_dir="chat",
        description="Main chat interface and API gateway",
    ),
    
    # Small models (< 7B params)
    "qwen": ModelConfig(
        name="qwen",
        port=8100,
        category=ModelCategory.SMALL,
        model_id="qwen3-4b",
        display_name="Qwen3 4B",
        inference_dir="qwen-inference",
        description="Multilingual (119 langs), 262K context, reasoning, coding",
        rank=2,
        hf_repo="unsloth/Qwen3-4B-Instruct-2507-GGUF",
        hf_file="Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        owned_by="qwen",
    ),
    "phi": ModelConfig(
        name="phi",
        port=8101,
        category=ModelCategory.SMALL,
        model_id="phi-4-mini",
        display_name="Phi-4 Mini",
        inference_dir="phi-inference",
        description="128K context, 22 languages, function calling, strong math (GSM8K 88.6%)",
        rank=9,
        hf_repo="unsloth/Phi-4-mini-instruct-GGUF",
        hf_file="Phi-4-mini-instruct-Q4_K_M.gguf",
        owned_by="microsoft",
        n_ctx=8192,
    ),
    "functiongemma": ModelConfig(
        name="functiongemma",
        port=8103,
        category=ModelCategory.SMALL,
        model_id="functiongemma-270m-it",
        display_name="FunctionGemma 270M",
        inference_dir="functiongemma-inference",
        description="Function calling specialist, edge-optimized (50 t/s on Pixel 8)",
        rank=12,
        hf_repo="unsloth/functiongemma-270m-it-GGUF",
        hf_file="functiongemma-270m-it-Q8_0.gguf",
        owned_by="google",
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
    ),
    "dasd": ModelConfig(
        name="dasd",
        port=8106,
        category=ModelCategory.SMALL,
        model_id="dasd-4b-thinking",
        display_name="DASD-4B Thinking",
        inference_dir="dasd-inference",
        description="Reasoning model with thinking capabilities from Alibaba-Apsara",
        rank=2,
        hf_repo="mradermacher/DASD-4B-Thinking-GGUF",
        hf_file="DASD-4B-Thinking.Q4_K_M.gguf",
        owned_by="alibaba-apsara",
        n_batch=512,
        max_concurrent=3,
    ),
    "agentcpm": ModelConfig(
        name="agentcpm",
        port=8107,
        category=ModelCategory.SMALL,
        model_id="agentcpm-explore-4b",
        display_name="AgentCPM-Explore 4B",
        inference_dir="agentcpm-inference",
        description="Agentic exploration model for autonomous task execution",
        rank=3,
        hf_repo="openbmb/AgentCPM-Explore-GGUF",
        hf_file="AgentCPM-Explore.Q4_K_M.gguf",
        owned_by="openbmb",
        n_ctx=4096,
        n_batch=512,
        max_concurrent=3,
    ),

    # Medium models (7B-30B params)
    "gemma": ModelConfig(
        name="gemma",
        port=8200,
        category=ModelCategory.MEDIUM,
        model_id="gemma-3-12b-it",
        display_name="Gemma 3 12B",
        inference_dir="gemma-inference",
        description="Gemma 3 IT, stronger instruction-following and safety with ~8K context",
        rank=6,
        hf_repo="unsloth/gemma-3-12b-it-GGUF",
        hf_file="gemma-3-12b-it-Q4_K_M.gguf",
        owned_by="google",
        n_ctx=8192,
    ),
    "llama": ModelConfig(
        name="llama",
        port=8201,
        category=ModelCategory.MEDIUM,
        model_id="llama-3.2-3b",
        display_name="Llama 3.2-3B",
        inference_dir="llama-inference",
        description="MMLU 63.4%, 128K context, multilingual",
        rank=10,
        hf_repo="unsloth/Llama-3.2-3B-Instruct-GGUF",
        hf_file="Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        owned_by="meta",
        chat_format="llama-3",
    ),
    "mistral": ModelConfig(
        name="mistral",
        port=8202,
        category=ModelCategory.MEDIUM,
        model_id="mistral-7b-instruct-v0.3",
        display_name="Mistral 7B v0.3",
        inference_dir="mistral-inference",
        description="MMLU 63%, 32K context, native function calling",
        rank=7,
        hf_repo="bartowski/Mistral-7B-Instruct-v0.3-GGUF",
        hf_file="Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
        owned_by="mistralai",
    ),
    "rnj": ModelConfig(
        name="rnj",
        port=8203,
        category=ModelCategory.MEDIUM,
        model_id="rnj-1-instruct",
        display_name="RNJ-1 Instruct",
        inference_dir="rnj-inference",
        description="Tool-calling, agentic (20.8% SWE-Bench Verified)",
        rank=9,
        hf_repo="unsloth/rnj-1-instruct-GGUF",
        hf_file="rnj-1-instruct-Q4_K_M.gguf",
        owned_by="essentialai",
        n_ctx=2048,
        n_batch=512,
        max_concurrent=3,
    ),

    # Reasoning models
    "r1qwen": ModelConfig(
        name="r1qwen",
        port=8300,
        category=ModelCategory.REASONING,
        model_id="deepseek-r1-distill-qwen-1.5b",
        display_name="DeepSeek R1 1.5B",
        inference_dir="deepseek-r1qwen-inference",
        description="Math reasoning (83.9% MATH-500), Codeforces 954 rating",
        rank=5,
        hf_repo="unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF",
        hf_file="DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
        owned_by="deepseek",
        workflow_file="inference.yml",
    ),
    "nanbeige": ModelConfig(
        name="nanbeige",
        port=8301,
        category=ModelCategory.REASONING,
        model_id="nanbeige4-3b-thinking",
        display_name="Nanbeige4-3B Thinking",
        inference_dir="nanbeige-inference",
        description="AIME 90.4%, GPQA 82.2%, outperforms Qwen3-32B on reasoning",
        rank=1,
        hf_repo="bartowski/Nanbeige_Nanbeige4-3B-Thinking-2511-GGUF",
        hf_file="Nanbeige_Nanbeige4-3B-Thinking-2511-Q4_K_M.gguf",
        owned_by="nanbeige",
        n_ctx=2048,
        n_batch=512,
        max_concurrent=4,
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
    """Get all inference models (excludes core services), sorted by rank."""
    models = [m for m in MODELS.values() if m.category != ModelCategory.CORE]
    return sorted(models, key=lambda m: m.rank)


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
