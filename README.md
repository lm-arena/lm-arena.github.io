# LM Arena

Self-hosted LLM inference using GitHub Actions as compute. Each model runs in a Docker container on a GitHub Actions runner, exposed via Cloudflare quick tunnel. Frontend is a static React app on GitHub Pages.

## Models

| Rank | Model | Size | Key Benchmarks | Best For |
|:-----|:------|:-----|:---------------|:---------|
| 1 | **Nanbeige4-3B Thinking** | 3B | AIME 90.4%, GPQA-Diamond 82.2% | Complex reasoning, math, competitive programming |
| 2 | **DASD-4B Thinking** | 4B | Thinking-mode reasoning | Step-by-step reasoning, problem solving |
| 2 | **Qwen3-4B** | 4B | MMLU-Pro 69.6%, GPQA 62.0%, 262K context | Multilingual (119 langs), long-context, agents |
| 3 | **SmolLM3 3B** | 3B | AIME 36.7%, BFCL 92.3%, 64K context | Tool-calling, reasoning, multilingual |
| 3 | **AgentCPM-Explore 4B** | 4B | Agentic exploration | Autonomous task planning and execution |
| 4 | **LFM2.5 1.2B** | 1.2B | 8 languages, 32K context, RL-tuned | Edge deployment, instruction following |
| 5 | **DeepSeek R1 1.5B** | 1.5B | MATH-500 83.9%, Codeforces 954 | Math reasoning, algorithmic problems |
| 6 | **Gemma 3 12B** | 12B | Safety-aligned, 8K context | Instruction following, safe generation |
| 7 | **Mistral 7B v0.3** | 7B | MMLU 63%, 32K context | JSON generation, tool use, structured output |
| 9 | **Phi-4 Mini** | 3.8B | GSM8K 88.6%, 128K context, 22 languages | Math, multilingual, function calling |
| 9 | **RNJ-1 Instruct** | 8B | SWE-Bench Verified 20.8% | Code automation, agentic workflows |
| 10 | **Llama 3.2 3B** | 3B | MMLU 63.4%, 128K context | Conversation, summarization, creative writing |
| 12 | **FunctionGemma 270M** | 270M | 50 t/s on Pixel 8, 32K context | Edge agents, mobile function calling |
| 13 | **GPT-OSS 20B** | 20B MoE (3.6B active) | Function calling, agentic operations | Experimental MoE, agent operations |

## How it works

```
GitHub Actions runner
  └── Docker: inference server (llama-cpp-python or llama-server)
        └── cloudflared quick tunnel → <random>.trycloudflare.com
              └── registered in tunnel-registry Worker

GitHub Pages (static frontend)
  └── fetches active tunnel URLs from tunnel-registry Worker
  └── streams chat directly to inference servers
```

- **Inference**: each `make inference MODEL=<name>` triggers a workflow on `ubuntu-24.04-arm`. The runner downloads the model from Hugging Face, starts the server, opens a Cloudflare quick tunnel, and registers its URL with the tunnel-registry Worker.
- **Frontend**: static Vite + React app. No backend — calls inference servers and GitHub Models API directly.
- **Tunnel registry**: a Cloudflare Worker at `tunnel-registry.jonasneves.workers.dev` maps model names to their currently-active tunnel URLs.

## Project Structure

```
├── .github/workflows/
│   ├── inference.yml                          # Dispatch: reads config, calls reusable workflow
│   ├── reusable-inference-containerized.yml   # Core: pull image, run server, start tunnel, monitor
│   ├── build-push-images.yml                  # Build and push Docker images to GHCR
│   └── deploy.yml                             # Deploy frontend to GitHub Pages
├── app/
│   ├── shared/                                # Shared Dockerfiles and Python inference code
│   ├── <model>-inference/                     # Per-model inference_server.py
│   ├── tunnel-registry/                       # Cloudflare Worker: active tunnel URL registry
│   └── chat/frontend/                         # Vite + React frontend
├── config/
│   └── models.py                              # Single source of truth: ports, HF repos, inference settings
├── scripts/
│   ├── generate_extension_config.py           # Regenerate frontend JSON configs from models.py
│   └── update_github_models.py                # Refresh GitHub Models catalog
└── docker-compose.yml                         # Local development
```

## Local Development

```bash
# Run a model server
docker compose --profile qwen up

# Run multiple
docker compose --profile qwen --profile phi up

# Run frontend (calls inference servers directly)
cd app/chat/frontend
npm install
npm run dev
```

## Configuration

All model settings live in `config/models.py`:

| Field | Description |
|-------|-------------|
| `hf_repo` / `hf_file` | Hugging Face GGUF source |
| `n_ctx` | Context window (default: 4096) |
| `n_threads` | CPU threads (default: 4) |
| `n_batch` | Batch size (default: 256) |
| `max_concurrent` | Parallel requests (default: 2) |

## API

Each inference server exposes an OpenAI-compatible API:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /v1/models` | List models |
| `POST /v1/chat/completions` | Chat completion (streaming supported) |

```bash
curl -X POST https://<random>.trycloudflare.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 512,
    "stream": true
  }'
```

Add `"include_perf": true` to get queue/compute timing in the response.

## License

MIT
