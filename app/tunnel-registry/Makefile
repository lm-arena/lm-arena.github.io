.DEFAULT_GOAL := help

help:
	@echo ""
	@echo "\033[2mDev\033[0m"
	@echo "  \033[36mdev\033[0m          Start local dev server"
	@echo "  \033[36mdeploy\033[0m       Deploy to Cloudflare Workers"
	@echo "  \033[36mhealth\033[0m       Check deployed worker health"
	@echo ""
	@echo "\033[2mSetup\033[0m"
	@echo "  \033[36mcreate-kv\033[0m    Create KV namespace (run once)"
	@echo "  \033[36mset-key\033[0m      Set TUNNEL_WRITE_KEY secret"
	@echo ""
	@echo "\033[2mTunnels\033[0m"
	@echo "  \033[36mtunnels\033[0m      List active tunnels"
	@echo ""

dev:
	npx wrangler dev

deploy:
	npx wrangler deploy

health:
	@curl -sf https://tunnel-registry.jonasneves.workers.dev/health && echo ""

create-kv:
	npx wrangler kv namespace create TUNNELS_KV

set-key:
	npx wrangler secret put TUNNEL_WRITE_KEY

tunnels:
	@curl -sf https://tunnel-registry.jonasneves.workers.dev/tunnels | node -e \
		"process.stdin.on('data',d=>{const t=JSON.parse(d);Object.entries(t).forEach(([k,v])=>console.log(k.padEnd(20),v))})"
