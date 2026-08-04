## Summary

## Why

## Scope

- Issue or TODO task:
- Explicitly out of scope:

## Architecture and boundaries

- [ ] New or changed projects have the correct Nx scope, runtime, and project-type tags
- [ ] No dependency boundary was weakened without an ADR or explicit rationale
- [ ] Generated files and downstream ownership rules are preserved
- [ ] No secret, production environment file, or sensitive log output is included

## Validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm nx affected -t lint typecheck test build`
- [ ] Relevant contract, security, delivery, database, preview, or generated-workspace checks
- [ ] Any unavailable local validation is documented below and covered by exact-head CI

Validation notes:

## Documentation and roadmap

- [ ] Documentation was updated, or no documentation change is needed
- [ ] `docs/TODO.md` was updated when roadmap status, scope, sequencing, or exit criteria changed
- [ ] No roadmap task is marked complete before implementation, documentation, applicable CI, and required review pass

## Rollout, migration, and risk

Describe compatibility impact, migrations, configuration changes, security boundaries, deployment sequencing, rollback, and any required operator action.
