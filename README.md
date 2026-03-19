# Apartment ERP

Full-featured apartment management system — room and tenant records, monthly billing, invoicing, payment matching, LINE messaging, maintenance tickets, and operational analytics.

The web interface is admin-only. Residents communicate through LINE Official Account rather than a separate tenant portal.

---

## Quick Start

### Option 1: Interactive Setup (Recommended for first-time setup)

```bash
node setup.mjs
```

The wizard configures your `.env`, runs migrations, and seeds the database.

### Option 2: Docker (Production-ready)

```bash
cd apps/erp
cp .env.example .env          # fill in DATABASE_URL, NEXTAUTH_SECRET, and LINE credentials
docker compose up -d
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed
```

App is available at `http://localhost:3000`.

### Option 3: Manual (Local PostgreSQL)

```bash
cd apps/erp
cp .env.example .env          # fill in DATABASE_URL and NEXTAUTH_SECRET at minimum
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev                   # starts on http://localhost:3001
```

---

## Make Commands

```
make help          See all available commands
make dev           Start development server (port 3001)
make build         Build for production
make test          Run test suite
make test-watch    Run tests in watch mode
make typecheck     TypeScript type check
make lint          ESLint
make check         typecheck + lint + test (CI equivalent)
make migrate       Run pending database migrations
make seed          Seed database with initial data
make studio        Open Prisma Studio
make docker-up     Start all containers
make docker-down   Stop all containers
make docker-logs   Tail app container logs
make backup        Dump compressed PostgreSQL backup
make clean         Remove .next / build artifacts
```

---

## Default Credentials

Populated by `npx prisma db seed`:

| Role  | Username | Password      |
|-------|----------|---------------|
| Admin | owner    | Owner@12345   |
| Staff | staff    | Staff@12345   |

Change these immediately in any environment that is accessible from the internet.

---

## Features

- **Room management** — floors, room types, occupancy status
- **Tenant and contract management** — move-in / move-out, contract terms
- **Monthly billing workflow** — editable billing records, bulk import
- **Invoice generation and delivery** — PDF invoices sent via LINE
- **Payment matching** — bank statement CSV import with auto-matching
- **Admin LINE chat inbox** — reply to tenant conversations from the web UI
- **Maintenance ticket tracking** — create, assign, and resolve tickets
- **Analytics** — revenue, occupancy, and collections dashboards
- **Document templates** — generate contracts and notices from templates
- **Audit logging** — actor-attributed log of all state-changing operations
- **Background jobs** — monthly billing generation, overdue checks, reminder dispatch

---

## Tech Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Frontend       | Next.js 14, React 18, TypeScript, Tailwind CSS |
| API            | Next.js App Router API routes                 |
| Database       | PostgreSQL 15+ with Prisma ORM                |
| Messaging      | LINE Official Account API                     |
| Background     | Custom outbox worker, Redis pub/sub           |
| Infrastructure | Docker, Redis (optional)                      |

---

## Project Structure

```
apartment_erp/
├── apps/erp/
│   ├── prisma/              # Schema, migrations, seed data
│   ├── src/
│   │   ├── app/             # Admin UI pages, login, API routes
│   │   ├── components/      # Shared React components
│   │   ├── infrastructure/  # Redis, S3, outbox adapters
│   │   ├── lib/             # Auth, config, events, utilities
│   │   └── modules/         # Domain services (billing, invoices, payments…)
│   ├── tests/               # Unit, API, integration, security tests
│   ├── docker-compose.yml
│   ├── Dockerfile
│   └── DEPLOYMENT.md        # Full VPS deployment guide
├── docs/
├── Makefile
└── setup.mjs
```

---

## Environment Variables

Copy `apps/erp/.env.example` and fill in the values. Required variables:

| Variable          | Description                                        |
|-------------------|----------------------------------------------------|
| `DATABASE_URL`    | PostgreSQL connection string                       |
| `NEXTAUTH_SECRET` | Random secret — generate with `openssl rand -hex 32` |

Optional (features degrade gracefully without them):

| Variable                 | Feature                             |
|--------------------------|-------------------------------------|
| `LINE_CHANNEL_ID`        | LINE messaging                      |
| `LINE_CHANNEL_SECRET`    | LINE messaging                      |
| `LINE_ACCESS_TOKEN`      | LINE messaging                      |
| `REDIS_URL`              | Rate-limiting and outbox worker     |
| `CRON_SECRET`            | Protected background-job endpoints  |
| `APP_BASE_URL`           | Absolute URL generation             |

See `apps/erp/.env.example` for the full list with descriptions.

---

## CI/CD

### GitHub Actions Workflows

| Workflow      | Trigger              | Steps                                  |
|---------------|----------------------|----------------------------------------|
| `ci.yml`      | Every PR             | typecheck → lint → test → build        |
| `deploy.yml`  | Push to `main`       | SSH deploy to VPS, migrate, reload     |

### Required Repository Secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret          | Description                                |
|-----------------|--------------------------------------------|
| `VPS_HOST`      | Server hostname or IP                      |
| `VPS_USER`      | SSH username                               |
| `VPS_SSH_KEY`   | Private SSH key (PEM format)               |
| `VPS_PORT`      | SSH port (optional, default `22`)          |
| `APP_URL`       | Public app URL, e.g. `https://yourdomain.com` |

---

## Deployment

Full instructions including Nginx reverse proxy, TLS, firewall, and backup scheduling are in [apps/erp/DEPLOYMENT.md](./apps/erp/DEPLOYMENT.md).

### Quick VPS deploy

```bash
git clone <your-repo-url> apartment_erp && cd apartment_erp/apps/erp
cp .env.example .env.production.local   # fill in production values
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

---

## API Surface

| Endpoint                  | Purpose                              |
|---------------------------|--------------------------------------|
| `GET  /api/health`        | Environment and DB connectivity check |
| `GET  /api/metrics`       | Memory, CPU, DB pool, uptime         |
| `/api/rooms`              | Room CRUD and status                 |
| `/api/tenants`            | Tenant management                    |
| `/api/contracts`          | Contract management                  |
| `/api/billing`            | Billing records and import           |
| `/api/invoices`           | Invoice generation, delivery, PDF    |
| `/api/payments`           | Payment import and matching          |
| `/api/conversations`      | Admin LINE chat inbox                |
| `/api/line/webhook`       | LINE webhook receiver                |

---

## License

MIT
