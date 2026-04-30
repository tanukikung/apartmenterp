# Contributing to Apartment ERP

## Development Setup

1. Fork and clone the repository
2. `npm install`
3. Copy `.env.example` to `.env` and fill in required values
4. Start infrastructure: `docker compose -f docker-compose.dev.yml up -d`
5. Run migrations: `npx prisma migrate dev`
6. Start dev server: `npm run dev`

## Branch Convention

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code refactoring without behavior change |
| `test/` | Adding or updating tests |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependencies, CI/CD |

Example: `feat/add-tenant-portal` · `fix/payment-duplicate-detection`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`

Examples:
- `feat(billing): add partial invoice update API`
- `fix(contracts): resolve drawer z-index layering bug`
- `docs(readme): add Docker deployment section`

## Pull Requests

1. Create a branch from `master`
2. Keep PRs focused — one logical change per PR
3. Fill in the PR description template
4. Ensure all tests pass locally: `npx vitest run`
5. Ensure TypeScript compiles: `npx tsc --noEmit`
6. Ensure no ESLint errors: `npm run lint`
7. Push — GitHub Actions will run the full pipeline automatically

## Testing Requirements

- **Unit tests**: Cover business logic in `modules/`
- **Integration tests**: Cover API routes with mocked DB
- **Smoke tests**: Playwright E2E for critical user flows
- All new features must include tests
- Bug fixes must include a regression test

Run all tests:
```bash
npx vitest run
npx tsx tests/smoke-test.ts
```
