# Contributing to Apartment ERP

## Dev Setup

```bash
git clone <repo>
npm install
cp .env.example .env    # fill in DATABASE_URL + NEXTAUTH_SECRET
docker compose up -d    # start PostgreSQL + Redis
npx prisma migrate dev
npx prisma db seed       # first run only
npm run dev
```

Server runs at **http://localhost:3001**

Default credentials: `owner / Owner@12345`

---

## Branch Convention

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code quality (no behavior change) |
| `test/` | Tests |
| `docs/` | Documentation |
| `chore/` | Tooling, dependencies, CI/CD |

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

Examples:
- `feat(billing): add per-unit water tier pricing`
- `fix(contracts): prevent duplicate active contracts`
- `docs(deploy): add Caddy reverse-proxy example`

---

## Pre-commit Checklist

Before pushing, run:

```bash
npx tsc --noEmit          # TypeScript
npx eslint src/ --max-warnings 0   # ESLint
npx prisma validate       # Schema
npx vitest run             # Tests
```

Pipeline runs automatically on push/PR.

---

## Architecture

- **Modules** (`src/modules/`) — business logic, no Next.js dependencies
- **API Routes** (`src/app/api/`) — request handling, auth, validation
- **Pages** (`src/app/admin/`) — React components, server-side data fetching
- **Lib** (`src/lib/`) — shared utilities (db, auth, rate-limit, errors, logger)

Never import API routes from modules. Never import React from `modules/`.
