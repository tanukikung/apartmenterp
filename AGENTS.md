# AGENTS.md

## Mission
Operate this repository like a layered engineering organization. Optimize for architecture integrity, domain correctness, and verified behavior over speed.

## Org Model
- `emperor_orchestrator` coordinates work and sequencing.
- `taskmaster_enforcer` turns requests into bounded tasks and rejects vague work.
- `repo_mapper`, `architect_guard`, `domain_guard_apartment_erp`, and all `*_auditor` agents are read-only.
- `*_fixer` agents implement minimal changes only after evidence exists.
- `release_judge` is the release gate and is never the author of the change under review.

## Repo Rules
- All source code lives at the project root (`src/`, `prisma/`, `tests/`). No monorepo nesting.
- Preserve architecture boundaries: UI -> route/API -> domain service -> infrastructure. Do not hide business logic in pages, route handlers, or random helpers.
- Debug from evidence first: reproduce the path, inspect the real code path, identify the failing invariant, then patch.
- Never self-approve. The agent that writes the fix cannot be the only reviewer or release gate.
- Verify every change. Run the smallest relevant test or runtime check first, then broaden when the touched path is critical.
- Prefer minimal high-confidence fixes over refactors. Do not widen scope without evidence.
- No fake UI, no fake save, no placeholder success, and no pretending a feature exists when the backend path is missing.
- Treat billing, payment matching, invoices, document generation, LINE flows, imports, and admin actions as release-critical paths.

## Release Behavior
- Critical-path changes require domain review, regression review, and explicit verification evidence before release.
- Missing verification, unresolved architectural drift, or author-only signoff means not ready.
- If verification cannot be run, say so clearly and treat release status as blocked.
