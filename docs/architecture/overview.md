# Architecture overview

The repository is an Nx monorepo. Nx projects, not folders alone, are the units of ownership, caching, affected analysis, generation, and dependency-boundary enforcement.

## Deployable applications

```text
apps/web       Next.js App Router delivery application
apps/api       NestJS HTTP delivery application
apps/worker    Node.js PostgreSQL-outbox worker and operations endpoint
```

Applications are composition roots. HTTP, framework, process lifecycle, and transport concerns stay in applications; reusable business behavior belongs in libraries.

## Current libraries

```text
packages/backend/agent-task          framework-free Agent Task domain and use cases
packages/backend/rate-limit          framework-free rate-limit policies and storage port
packages/web/features/agent-tasks    browser-facing Agent Tasks feature and client behavior
packages/ui                          shared React presentation
packages/contracts                   OpenAPI source, generated client/server types, and runtime validators
packages/database                    PostgreSQL schema, migrations, repositories, outbox, and rate-limit adapters
packages/env                         Node-only validated configuration
packages/observability               structured logging, metrics, tracing, and telemetry setup
```

`tools/workspace-plugin` owns the released preset, structural generators, and downstream upgrade tooling. `tools/delivery`, `infra`, and `performance` own production-image preparation, environment validation, preview orchestration, release plans, and performance budgets.

## Dependency direction

- Applications may compose libraries; libraries never import applications.
- Browser projects cannot depend on Node-only projects.
- Domain and contract projects remain framework-free.
- Infrastructure adapters implement ports owned by domain or policy libraries.
- HTTP contracts originate in `packages/contracts/openapi/source`; generated artifacts are consumed at API and browser boundaries.
- The API persists Agent Tasks and outbox events transactionally. The worker claims outbox rows at least once and executes fenced, idempotent handlers.

See `docs/architecture/dependency-rules.md` for the exact enforced tag matrix and `docs/reference-feature-agent-tasks.md` for the canonical end-to-end flow.
