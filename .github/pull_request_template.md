## Summary

<!-- Describe what this PR does and WHY. One clear paragraph is enough. -->

## Type of change

<!-- Check all that apply. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactor / code quality (no functional change)
- [ ] Documentation update
- [ ] CI / tooling change
- [ ] Dependency update

## Related issues

<!-- Link any related issues or tickets. -->

Closes #

## Changes made

<!-- Bullet-point list of what changed. Keep it concise. -->

-
-
-

## Testing checklist

<!-- Every box should be checked before requesting review. -->

- [ ] `npm test` passes locally (vitest)
- [ ] `npx tsc --noEmit` reports no TypeScript errors
- [ ] `npm run lint` passes with no new warnings
- [ ] Manually tested the affected feature/page in the browser
- [ ] New or updated tests cover the changed behaviour
- [ ] No existing tests were deleted without a documented reason

## Database changes

<!-- If this PR touches the Prisma schema or migrations, answer these. -->

- [ ] No database changes in this PR
- [ ] Added a new migration (`prisma migrate dev --name ...`)
- [ ] Migration is backward-compatible (old app version can still run against new schema)
- [ ] Seed data updated if required

## Screenshots / recordings

<!-- Optional but strongly encouraged for UI changes. Drag & drop images below. -->

<details>
<summary>Before</summary>

<!-- paste screenshot -->

</details>

<details>
<summary>After</summary>

<!-- paste screenshot -->

</details>

## Deployment notes

<!-- Anything the reviewer or deployer needs to know: new env vars, feature flags,
     manual steps, cache busting, etc. Write "None" if not applicable. -->

None

## Reviewer checklist

<!-- For the reviewer — not the author. -->

- [ ] Code is readable and well-commented where needed
- [ ] No sensitive data (passwords, tokens, PII) committed
- [ ] No `console.log` / debug statements left in
- [ ] API contracts and types are consistent
- [ ] Performance impact considered for large datasets
