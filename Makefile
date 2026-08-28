SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help setup env infra install prisma api web worker dev docker down test

API := apps/api
WEB := apps/web

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make <target>\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\n  Web  http://localhost:3000\n  API  http://localhost:3001/v1/health\n\n'

setup: env infra install prisma ## First-time: .env, Postgres, Redis, deps, schema

env: ## Create .env from the example if it is missing
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		secret="$$(openssl rand -hex 64)"; \
		sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$${secret}/" .env; \
		echo "Created .env (JWT_SECRET generated). Review POSTGRES_* / DATABASE_URL / REDIS_URL."; \
	fi
	@cp .env $(API)/.env
	@cp .env $(WEB)/.env

infra: ## Start Postgres and Redis
	docker compose up -d postgres redis

install: ## Install API and web dependencies
	npm install --prefix $(API)
	@cd $(API) && npm install-scripts approve prisma @prisma/client @prisma/engines bcrypt >/dev/null 2>&1 || true
	npm install --prefix $(WEB)

prisma: env ## Generate Prisma client and apply migrations
	npm run prisma:generate --prefix $(API)
	npm run prisma:deploy --prefix $(API)

api: env ## Start the NestJS API (watch)
	npm run start:dev --prefix $(API)

web: env ## Start the Next.js app
	npm run dev --prefix $(WEB)

worker: env ## Start the payment-recovery worker
	npm run worker:recovery --prefix $(API)

dev: env ## Start API, web, and recovery worker
	trap 'kill 0' INT TERM; \
	$(MAKE) api & \
	$(MAKE) web & \
	$(MAKE) worker & \
	wait

docker: ## Build and run the full Docker Compose stack
	docker compose up --build

down: ## Stop Compose services
	docker compose down

test: ## Run API unit tests
	JWT_SECRET=$${JWT_SECRET:-test-secret} npm test --prefix $(API)
