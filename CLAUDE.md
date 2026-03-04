# LM Arena

LLM playground running on GitHub Actions, exposed via Cloudflare quick tunnels. Static frontend on GitHub Pages.

## Commands

- `make build` — build frontend
- `make lint` / `make format` — Python code quality
- `make inference MODEL=<name>` — launch one inference server
- `make up` / `make down` — launch or cancel all inference servers

## Architecture

`app/chat/frontend/` — Vite + React static frontend (deployed to GitHub Pages)
`app/*/` — inference server containers (run on GitHub Actions)
`app/tunnel-registry/` — Cloudflare Worker mapping model names to active tunnel URLs
`config/models.py` — single source of truth: ports, HF repos, model metadata
`docker-compose.yml` — local development
