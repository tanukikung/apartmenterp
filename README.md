# Apartment ERP

Apartment ERP is a single-building operations system for room management, tenant records, contracts, monthly billing, invoicing, payment matching, maintenance, and LINE messaging. The web application is admin-only; residents communicate through LINE instead of a separate tenant portal.

## Tech Stack

- Frontend: Next.js 14, React, TypeScript, Tailwind CSS
- Backend: Next.js App Router API routes, TypeScript
- Database: PostgreSQL with Prisma ORM
- Messaging: LINE Official Account API
- Infrastructure: Redis, background workers, outbox pattern

## Features

- Room, tenant, and contract management
- Monthly billing workflow with editable records
- Invoice generation, delivery, and payment tracking
- Bank statement import with payment matching
- Admin chat inbox for LINE conversations
- Maintenance ticket tracking
- Revenue, occupancy, and collections analytics
- Audit logging and operational health endpoints

## Project Structure

```text
apartment_erp/
|-- apps/
|   `-- erp/
|       |-- prisma/              # Schema, migrations, seed data
|       |-- src/
|       |   |-- app/             # Admin UI, login, API routes
|       |   |-- components/      # Shared React components
|       |   |-- infrastructure/  # Redis, storage, external adapters
|       |   |-- lib/             # DB, LINE, events, utilities
|       |   `-- modules/         # Domain services
|       |-- tests/               # Unit, API, integration, security tests
|       |-- docker-compose.yml
|       `-- Dockerfile
|-- docs/
`-- package.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Docker (optional)

### Installation

1. Install dependencies from the workspace root:

```bash
npm install
```

2. Move into the app workspace:

```bash
cd apps/erp
```

3. Copy environment file:

```bash
cp .env.example .env
```

4. Update `.env` with database, admin, and LINE credentials:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/apartment_erp"
ADMIN_TOKEN="your_admin_token"
LINE_CHANNEL_ID="your_channel_id"
LINE_CHANNEL_SECRET="your_channel_secret"
LINE_ACCESS_TOKEN="your_access_token"
NEXTAUTH_SECRET="generate_with_openssl"
```

5. Generate Prisma client:

```bash
npm run db:generate
```

6. Run database migrations:

```bash
npm run db:migrate
```

7. Seed the database:

```bash
npm run db:seed
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in at [http://localhost:3000/login](http://localhost:3000/login).

### Production

```bash
npm run build
npm start
```

For Docker/VPS deployment details, see [apps/erp/DEPLOYMENT.md](./apps/erp/DEPLOYMENT.md).

## API Surface

- `GET /api/health` - Health check
- `/api/rooms` - Room management
- `/api/tenants` - Tenant management
- `/api/contracts` - Contract management
- `/api/billing` - Billing management
- `/api/invoices` - Invoice management
- `/api/payments` - Payment import and matching
- `/api/conversations` - Admin chat inbox
- `/api/line/webhook` - LINE webhook

## Documentation

- [System Architecture](./docs/SYSTEM_ARCHITECTURE.md)
- [Domain Model](./docs/DOMAIN_MODEL.md)
- [Database Schema](./docs/DATABASE_SCHEMA.md)
- [Domain Event Flow](./docs/DOMAIN_EVENT_FLOW.md)

## License

MIT
