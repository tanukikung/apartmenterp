# ============================================================
# Apartment ERP — Makefile
# Usage: make <target>
# ============================================================

.PHONY: help dev build test test-watch test-coverage lint typecheck check \
        install setup migrate migrate-dev seed studio db-reset generate \
        docker-up docker-down docker-build docker-logs docker-psql \
        docker-shell docker-migrate docker-clean backup clean clean-all

# Default target
.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Development ────────────────────────────────────────────

dev: ## Start development server on port 3001
	cd apps/erp && npm run dev

build: ## Build for production
	cd apps/erp && npm run build

# ── Quality checks ─────────────────────────────────────────

test: ## Run test suite
	cd apps/erp && npm test

test-watch: ## Run tests in watch mode
	cd apps/erp && npm run test:watch

test-coverage: ## Run tests with coverage report
	cd apps/erp && npm run test:coverage

lint: ## Run ESLint
	cd apps/erp && npm run lint

typecheck: ## Run TypeScript type check
	cd apps/erp && npx tsc --noEmit

check: typecheck lint test ## Run all quality checks (typecheck + lint + test)

# ── Setup ──────────────────────────────────────────────────

install: ## Install all dependencies
	cd apps/erp && npm install

setup: ## Run interactive setup wizard
	node setup.mjs

# ── Database ───────────────────────────────────────────────

migrate: ## Run database migrations
	cd apps/erp && npx prisma migrate deploy

migrate-dev: ## Create new migration (dev only)
	cd apps/erp && npx prisma migrate dev

seed: ## Seed database with initial data
	cd apps/erp && npx prisma db seed

studio: ## Open Prisma Studio
	cd apps/erp && npx prisma studio

db-reset: ## Reset and reseed database (DESTRUCTIVE)
	@echo "WARNING: This will reset ALL data. Press Ctrl+C to cancel..."
	@sleep 3
	cd apps/erp && npx prisma migrate reset --force

generate: ## Regenerate Prisma client
	cd apps/erp && npx prisma generate

# ── Docker ─────────────────────────────────────────────────

docker-up: ## Start all containers (postgres + redis + app)
	cd apps/erp && docker compose up -d

docker-down: ## Stop all containers
	cd apps/erp && docker compose down

docker-build: ## Build Docker image
	cd apps/erp && docker compose build --no-cache

docker-logs: ## Tail app logs
	cd apps/erp && docker compose logs -f app

docker-psql: ## Open PostgreSQL shell
	cd apps/erp && docker compose exec postgres psql -U postgres apartment_erp

docker-shell: ## Open shell in app container
	cd apps/erp && docker compose exec app sh

docker-migrate: ## Run migrations in Docker container
	cd apps/erp && docker compose run --rm migrate

docker-clean: ## Remove stopped containers and unused images
	docker system prune -f

# ── Backup ─────────────────────────────────────────────────

backup: ## Create database backup
	cd apps/erp && docker compose exec -T postgres pg_dump -U postgres apartment_erp | gzip > backup_$$(date +%F_%H%M).sql.gz
	@echo "Backup created: backup_$$(date +%F_%H%M).sql.gz"

# ── Clean ──────────────────────────────────────────────────

clean: ## Remove build artifacts and cache
	rm -rf apps/erp/.next apps/erp/dist apps/erp/tsconfig.tsbuildinfo tsconfig.tsbuildinfo
	@echo "Build artifacts removed"

clean-all: clean ## Remove everything including node_modules
	rm -rf apps/erp/node_modules node_modules
	@echo "node_modules removed"
