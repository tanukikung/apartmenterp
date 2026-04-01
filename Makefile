# ============================================================
# Apartment ERP — Makefile
# Usage: make <target>   |   make help  (see all commands)
# ============================================================

.PHONY: help dev build test test-watch test-coverage lint typecheck check \
        install setup migrate migrate-dev seed studio db-reset generate \
        docker-up docker-up-light docker-down docker-build docker-logs \
        docker-psql docker-shell docker-migrate docker-clean \
        backup clean clean-all

# Default target
.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ── Development ────────────────────────────────────────────

dev: ## Start development server (port 3001)
	npm run dev

build: ## Build for production
	npm run build

# ── Quality checks ─────────────────────────────────────────

test: ## Run test suite
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-coverage: ## Run tests with coverage report
	npm run test:coverage

lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript type check
	npx tsc --noEmit

check: typecheck lint test ## Run all quality checks (typecheck + lint + test)

# ── Setup ──────────────────────────────────────────────────

install: ## Install all dependencies
	npm install

setup: ## Run interactive setup wizard
	node setup.mjs

# ── Database ───────────────────────────────────────────────

migrate: ## Run database migrations
	npx prisma migrate deploy

migrate-dev: ## Create new migration (dev only)
	npx prisma migrate dev

seed: ## Seed database with initial data
	npx prisma db seed

studio: ## Open Prisma Studio GUI
	npx prisma studio

db-reset: ## Reset and reseed database (DESTRUCTIVE)
	@echo "⚠️  This will reset ALL data. Press Ctrl+C to cancel..."
	@sleep 3
	npx prisma migrate reset --force

generate: ## Regenerate Prisma client
	npx prisma generate

# ── Docker ─────────────────────────────────────────────────

docker-up: ## Start full stack (postgres + redis + app)
	docker compose up -d
	@echo ""
	@echo "  ✅  Stack started:"
	@echo "  App:        http://localhost:3000"
	@echo "  Postgres:   localhost:5432"

docker-up-light: ## Start without Redis (lighter)
	docker compose up -d postgres migrate app
	@echo ""
	@echo "  ✅  Light stack started:"
	@echo "  App:      http://localhost:3000"
	@echo "  Postgres: localhost:5432"

docker-down: ## Stop all containers
	docker compose down

docker-build: ## Rebuild app Docker image (no cache)
	docker compose build --no-cache app

docker-logs: ## Tail app logs
	docker compose logs -f app

docker-psql: ## Open PostgreSQL shell
	docker compose exec postgres psql -U postgres apartment_erp

docker-shell: ## Open shell in app container
	docker compose exec app sh

docker-migrate: ## Run migrations in Docker container
	docker compose run --rm migrate

docker-clean: ## Remove stopped containers and unused images
	docker system prune -f

# ── Backup ─────────────────────────────────────────────────

backup: ## Create PostgreSQL backup (gzipped)
	@DATE=$$(date +%F_%H%M) && \
	 docker compose exec -T postgres pg_dump -U postgres apartment_erp | gzip > backup_$$DATE.sql.gz && \
	 echo "  ✅  Backup saved: backup_$$DATE.sql.gz"

# ── Clean ──────────────────────────────────────────────────

clean: ## Remove build artifacts and cache
	rm -rf .next dist tsconfig.tsbuildinfo
	@echo "  ✅  Build artifacts removed"

clean-all: clean ## Remove everything including node_modules
	rm -rf node_modules
	@echo "  ✅  node_modules removed"
