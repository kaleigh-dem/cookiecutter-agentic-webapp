# Everyday Development

This page documents the repository-level commands humans and AI agents use during normal work, the standard agent iteration loop, and when focused Nx commands are preferable.

## Prerequisites

- Dependencies installed with `pnpm install --frozen-lockfile`.
- A local `.env` file for application and database work.
- Docker running for PostgreSQL-backed flows and integration tests.

## Use repository commands instead of underlying tools

The root scripts encode project selection, dependency ordering, caching, generated outputs, security policy, and delivery checks. Prefer `pnpm` and Nx commands over direct `next`, `nest`, `tsc`, `eslint`, or `vitest` invocation.

Run all commands from the workspace root.

## Standard agent iteration loop

For each scoped task:

1. Read the root and closest nested `AGENTS.md`.
2. Inspect the target with `pnpm nx show project <PROJECT_NAME>` and the project graph.
3. Identify the source of truth and use a local generator for repeated structure.
4. Make the smallest coherent change through public package boundaries.
5. Run focused type checking, tests, and builds.
6. Run `pnpm affected` while iterating across dependent projects.
7. Run `pnpm format` and `pnpm check` before handoff.
8. Review the diff, generated files, migrations, and remaining human decisions.

See [Agentic Development Model](Agentic-Development-Model) for the complete operating model and approval boundaries.

## Start local development

```bash
pnpm infra:up
pnpm db:migrate
pnpm dev
```

`pnpm dev` executes available `dev` and `serve` targets through Nx.

## Run one application

```bash
pnpm nx run web:dev
pnpm nx run api:serve
pnpm nx run worker:serve
```

The web target is inferred by the Nx Next plugin. API and worker targets are defined in their `project.json` files.

Inspect a target before using it:

```bash
pnpm nx show project <PROJECT_NAME>
```

## Run affected validation

For a focused branch:

```bash
pnpm affected
```

Equivalent explicit form:

```bash
pnpm nx affected -t lint typecheck test build
```

Nx compares the current work to the configured base branch (`main`) and includes dependent projects.

## Format

Write formatting changes:

```bash
pnpm format
```

Check only:

```bash
pnpm format:check
```

## Lint and type check

Repository-wide:

```bash
pnpm lint
pnpm typecheck
```

Focused project:

```bash
pnpm nx run <PROJECT_NAME>:lint
pnpm nx run <PROJECT_NAME>:typecheck
```

Examples:

```bash
pnpm nx run api:typecheck
pnpm nx run worker:typecheck
pnpm nx run web:typecheck
```

## Test

Repository-wide:

```bash
pnpm test
```

Focused:

```bash
pnpm nx run <PROJECT_NAME>:test
```

Database tests use PostgreSQL containers and can take longer:

```bash
pnpm nx run database:test
```

Run without Nx cache when validating security or stateful behavior:

```bash
pnpm nx run api:test --skip-nx-cache
```

## Build

```bash
pnpm build
```

Focused:

```bash
pnpm nx run <PROJECT_NAME>:build
```

A production web build requires an explicit browser authentication profile. In CI the generic build sets:

```bash
NEXT_PUBLIC_AUTHENTICATION_PROFILE=none pnpm nx run web:build
```

For a real release, select `oidc`, `session`, or intentionally `none`.

## Inspect the graph

```bash
pnpm graph
pnpm nx show projects
pnpm nx show project <PROJECT_NAME>
```

Use the graph before changing an import boundary or deleting a project.

## Add dependencies

Add a root development tool:

```bash
pnpm add -D -w <PACKAGE>
```

Add a dependency to a workspace package:

```bash
pnpm --filter <PACKAGE_NAME> add <DEPENDENCY>
```

After dependency changes:

```bash
pnpm install
pnpm nx sync
pnpm check
```

Commit `package.json` and `pnpm-lock.yaml` together. Do not edit lockfile entries manually.

## Work with environment variables

1. Add the variable to the relevant validated configuration schema.
2. Add a safe example to `.env.example` or the correct `infra/environments/*.example`.
3. Pass it explicitly through Compose, Docker build arguments, or runtime configuration.
4. Update production validation when the variable is security- or delivery-critical.
5. Never commit a real secret.

Browser variables beginning with `NEXT_PUBLIC_` are compiled into the web bundle. Changing them only at container runtime does not change an already-built image.

## Stop and restart infrastructure

```bash
pnpm infra:down
pnpm infra:up
```

Inspect state:

```bash
docker compose ps
docker compose logs postgres
```

The named PostgreSQL volume is retained. Use the destructive volume-removal procedure in [Database and Data Management](Database-and-Data-Management) only for disposable data.

## Prepare a reviewable agent handoff

Before opening a pull request, an agent should summarize the intended behavior, projects changed, boundaries affected, validation run, and any production or human follow-up. The summary complements the diff; it does not replace review.

## Prepare a pull request

```bash
pnpm format
pnpm affected
pnpm check
pnpm template:identity:check
git status --short
```

Then review:

```bash
git diff --stat
git diff
```

For generated-workspace application teams, update relevant product documentation. The upstream `docs/TODO.md` process applies to maintainers of the template itself, not automatically to every generated product repository.

## Focused iteration guide

| Change                     | Minimum useful feedback                                               |
| -------------------------- | --------------------------------------------------------------------- |
| Web feature                | feature test, `web:typecheck`, web build or e2e as appropriate        |
| API controller/security    | `api:test --skip-nx-cache`, `api:typecheck`, `api:build`              |
| Domain library             | project test, typecheck, affected                                     |
| Database migration/adapter | `database:test`, `db:migrate`, `db:status`                            |
| Worker job                 | `worker:test`, `worker:typecheck`, `worker:build`                     |
| Contract                   | `contracts:generate`, `contracts:check`, `contracts:compat`, affected |
| Delivery                   | `delivery:check`, preview lifecycle                                   |

## Related pages

- [Validation and Testing](Validation-and-Testing)
- [Agentic Development Model](Agentic-Development-Model)
- [Code Generation](Code-Generation)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [Code Generation](Code-Generation)
2. [Validation and Testing](Validation-and-Testing)

[Back to Home](Home)
