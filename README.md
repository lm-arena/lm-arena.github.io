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

## License

MIT
