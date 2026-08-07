# Architecture overview

The repository is an Nx monorepo designed for long-lived web applications that may be built across many human and AI-agent sessions. Nx projects, not folders alone, are the units of ownership, caching, affected analysis, generation, and dependency-boundary enforcement.

The architecture is intentionally represented in forms that contributors can inspect and tools can enforce. Written guidance explains intent; project tags, public entry points, generated contracts, TypeScript references, and lint rules determine whether a proposed change conforms.

## Agent-facing control plane

- Root and nested `AGENTS.md` files describe repository-wide and local rules.
- `.mcp.json` exposes the Nx MCP server for compatible agent clients.
- `project.json` files and the Nx graph expose targets, tags, dependencies, and affected projects.
- `src/index.ts` files define supported cross-project APIs.
- `docs/adr` records durable architecture decisions.
- Local generators create approved domain, feature, job, and contract structures.
- Root package scripts provide stable validation and delivery commands.

See `docs/agentic-development.md` for the standard workflow and human approval boundaries.

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

`tools/workspace-plugin` owns the released preset, structural generators, and downstream upgrade tooling. `tools/delivery`, `infra`, and `performance` own production-image preparation, environment validation, preview orchestration, release manifests and plans, and performance budgets. `tools/documentation` validates documented links, paths, commands, environment names, identity and authentication descriptions, architecture evidence, and change records.

## Generated project graph

`docs/architecture/project-graph.md` is generated from the current Nx project graph and committed for review. Regenerate it whenever an Nx project is added, removed, retagged, or rewired:

```bash
pnpm docs:architecture
pnpm docs:check
```

The graph check fails when the committed diagram differs from Nx. See `docs/documentation-integrity.md` for the complete validation contract.

## Dependency direction

- Applications may compose libraries; libraries never import applications.
- Browser projects cannot depend on Node-only projects.
- Domain and contract projects remain framework-free.
- Infrastructure adapters implement ports owned by domain or policy libraries.
- HTTP contracts originate in `packages/contracts/openapi/source`; generated artifacts are consumed at API and browser boundaries.
- The API persists Agent Tasks and outbox events transactionally. The worker claims outbox rows at least once and executes fenced, idempotent handlers.
- Cross-project imports use public entry points rather than deep internal paths.

Do not weaken a boundary merely to make an agent-authored change compile. Move the behavior to the correct project, introduce a deliberate public boundary, or document an intentional architecture decision.

See `docs/architecture/dependency-rules.md` for the exact enforced tag matrix and `docs/reference-feature-agent-tasks.md` for the canonical end-to-end flow.
