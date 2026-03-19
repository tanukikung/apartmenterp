# ============================================================
# Apartment ERP — Makefile
# Usage: make <target>   |   make help  (see all commands)
# ============================================================

.PHONY: help dev build test test-watch test-coverage lint typecheck check \
        install setup migrate migrate-dev seed studio db-reset generate \
        docker-up docker-up-light docker-down docker-build docker-logs \
        docker-psql docker-shell docker-migrate docker-clean \
        onlyoffice-start onlyoffice-stop onlyoffice-logs onlyoffice-status \
        backup clean clean-all

# Default target
.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# ── Development ────────────────────────────────────────────

dev: ## Start development server (port 3001)
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

studio: ## Open Prisma Studio GUI
	cd apps/erp && npx prisma studio

db-reset: ## Reset and reseed database (DESTRUCTIVE)
	@echo "⚠️  This will reset ALL data. Press Ctrl+C to cancel..."
	@sleep 3
	cd apps/erp && npx prisma migrate reset --force

generate: ## Regenerate Prisma client
	cd apps/erp && npx prisma generate

# ── Docker ─────────────────────────────────────────────────

docker-up: ## Start full stack (postgres + redis + onlyoffice + app)
	cd apps/erp && docker compose up -d
	@echo ""
	@echo "  ✅  Stack started:"
	@echo "  App:        http://localhost:3000"
	@echo "  OnlyOffice: http://localhost:8080  (ready in ~2 min)"
	@echo "  Postgres:   localhost:5432"

docker-up-light: ## Start without OnlyOffice (faster, uses less RAM)
	cd apps/erp && docker compose up -d postgres redis migrate app
	@echo ""
	@echo "  ✅  Light stack started (no OnlyOffice):"
	@echo "  App:      http://localhost:3000"
	@echo "  Postgres: localhost:5432"

docker-down: ## Stop all containers
	cd apps/erp && docker compose down

docker-build: ## Rebuild app Docker image (no cache)
	cd apps/erp && docker compose build --no-cache app

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

# ── OnlyOffice ─────────────────────────────────────────────

onlyoffice-start: ## Start (or restart) OnlyOffice Document Server
	cd apps/erp && docker compose up -d onlyoffice
	@echo "  ⏳  OnlyOffice starting — takes ~60–120 s on first boot."
	@echo "  Watch progress: make onlyoffice-logs"

onlyoffice-stop: ## Stop OnlyOffice (saves RAM when not in use)
	cd apps/erp && docker compose stop onlyoffice
	@echo "  ✅  OnlyOffice stopped."

onlyoffice-logs: ## Tail OnlyOffice container logs
	cd apps/erp && docker compose logs -f onlyoffice

onlyoffice-status: ## Check if OnlyOffice is ready
	@echo "Checking OnlyOffice health..."
	@curl -sf http://localhost:$${ONLYOFFICE_PORT:-8080}/healthcheck \
	  && echo "  ✅  OnlyOffice is READY" \
	  || echo "  ❌  OnlyOffice is not ready yet (still starting or stopped)"

# ── Backup ─────────────────────────────────────────────────

backup: ## Create PostgreSQL backup (gzipped)
	@DATE=$$(date +%F_%H%M) && \
	 cd apps/erp && \
	 docker compose exec -T postgres pg_dump -U postgres apartment_erp | gzip > ../../backup_$$DATE.sql.gz && \
	 echo "  ✅  Backup saved: backup_$$DATE.sql.gz"

# ── Clean ──────────────────────────────────────────────────

clean: ## Remove build artifacts and cache
	rm -rf apps/erp/.next apps/erp/dist apps/erp/tsconfig.tsbuildinfo tsconfig.tsbuildinfo
	@echo "  ✅  Build artifacts removed"

clean-all: clean ## Remove everything including node_modules
	rm -rf apps/erp/node_modules node_modules
	@echo "  ✅  node_modules removed"
