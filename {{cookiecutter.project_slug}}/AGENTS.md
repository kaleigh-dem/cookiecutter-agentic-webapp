# Repository instructions

## Purpose

This repository contains a browser application, modular API, optional worker, and shared packages.

## Before editing

1. Read the closest `AGENTS.md`.
2. Read the owning module's `README.md`.
3. Locate existing tests and public contracts.
4. Confirm which module owns the behavior.
5. Check `docs/adr` for relevant decisions.

## Dependency rules

- Applications may import packages; packages must never import applications.
- Business modules communicate through public application interfaces, contracts, or events.
- Never import another module's repositories or persistence models.
- Access environment variables only through `packages/env`.
- Never manually edit generated files.
- Keep route handlers and controllers thin.
- Explain every new runtime dependency in the pull request.

## Definition of done

- Formatting, lint, types, tests, and build pass.
- New behavior has tests at the lowest effective layer.
- Public contracts and documentation are updated.
- Database changes include a safe rollout and rollback strategy.
- Sensitive values are not logged or committed.
