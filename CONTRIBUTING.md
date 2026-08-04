# Contributing

## Before starting

1. Search open issues and pull requests for overlapping work.
2. Read the root `AGENTS.md`, the nearest nested `AGENTS.md`, and relevant ADRs.
3. Review `docs/TODO.md` for the active phase, stable task IDs, and sequencing constraints.
4. Create a focused branch from the current `main` branch.

Do not open a public issue for a suspected vulnerability, exposed credential, or security-sensitive configuration defect. Follow `SECURITY.md` and use GitHub's private vulnerability reporting flow.

## Making changes

- Use Nx generators for projects and repeated structures; check generator help rather than guessing options.
- Preserve project tags and the documented web, backend, shared, runtime, and project-type boundaries.
- Add tests at the lowest effective layer for new public behavior and regressions.
- Update documentation when commands, configuration, generated output, ownership, or operational behavior changes.
- Update `docs/TODO.md` only when a pull request changes roadmap status, scope, sequencing, or exit criteria. Keep task IDs stable.
- Record architectural boundary changes in an ADR or explain the rationale explicitly in the pull request.
- Never commit secrets, production environment files, or sensitive logs.

## Validation

Install exactly what the lockfile declares:

```bash
pnpm install --frozen-lockfile
```

For a focused change, run at least:

```bash
pnpm format:check
pnpm nx affected -t lint typecheck test build
```

Run the relevant contract, security, delivery, database, preview, or generated-workspace checks when those surfaces change. Use `pnpm check` for the complete repository validation contract before review when the environment supports it. Document any unavailable OS-level or external-service validation in the pull request and rely on exact-head CI for that gate.

## Pull requests

- Keep implementation, refactoring, dependency updates, and generated output in reviewable scope.
- Explain why the change is needed, the affected boundaries, validation performed, and rollout or migration risk.
- Link the issue or stable TODO task when one exists.
- Do not mark a roadmap task complete before implementation, documentation, applicable CI, and required review have passed.
- Resolve review feedback on the current head; do not carry assumptions forward from superseded commits.
