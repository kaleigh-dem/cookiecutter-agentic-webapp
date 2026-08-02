# Generated workspace onboarding

This guide covers the first decisions and commands for a repository created from the released template. It is intentionally written for generated application owners rather than upstream template maintainers.

## Required local tooling

Install these tools before creating or running a workspace:

- Git
- Node.js 24 LTS; the repository includes `.node-version`
- Corepack with pnpm 10.13.1
- Docker Engine with Docker Compose v2 for PostgreSQL, Redis, images, and preview validation
- a GitHub account with permission to create the target repository and configure its settings

Confirm the runtime before installing dependencies:

```bash
node --version
corepack enable
pnpm --version
docker version
docker compose version
```

The supported Node.js and pnpm ranges are enforced by `package.json`. See `docs/runtime-support.md` for the runtime upgrade policy.

## Create and initialize a workspace

Create the Nx workspace from the template repository, then initialize its permanent identity and profiles:

```bash
npx create-nx-workspace@23.1.0 customer-portal \
  --template kaleigh-dem/cookiecutter-agentic-webapp
cd customer-portal
corepack enable
pnpm install --frozen-lockfile
pnpm initialize:workspace customer-portal \
  --displayName="Customer Portal" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --codeowners=@acme/platform,@acme/security \
  --applications=web,api,worker \
  --authentication=development \
  --workerTransport=postgres \
  --deploymentProfile=containers
pnpm install --frozen-lockfile
pnpm template:identity:check
```

Use the tagged template release and matching workspace-plugin artifact when reproducibility across multiple repositories matters. The generated `workspace.template.json` records the originating release, selected applications, ports, database name, repository ownership, and profile choices.

## Supported profiles

Profile choices are recorded in `workspace.template.json`. Some choices configure a complete local path; others declare the production integration that the generated repository must supply.

| Setting | Supported values | Default | Current behavior and production note |
| --- | --- | --- | --- |
| Applications | `web`, `api`, `worker` | all three | Unselected applications are removed. Authentication requires `api`; session authentication also requires `web`; a selected worker requires a transport. |
| Authentication | `development`, `none`, `oidc`, `session` | `development` when `api` is selected, otherwise `none` | `development` supplies the fixed local token path and must not ship to production. `oidc` and `session` record the intended production profile; generated owners must complete and validate the provider-specific verifier or session integration before release. |
| Worker transport | `none`, `postgres`, `redis` | `postgres` when `worker` is selected, otherwise `none` | Records the intended delivery transport. The reference worker and outbox remain an implementation example until the repository defines leasing, retries, idempotency, and dead-letter behavior. |
| Telemetry | `true`, `false` | `false` | `true` enables local OTLP defaults. Production still requires an owned collector or observability backend, credentials, retention, sampling, and alerting. |
| Deployment | `containers`, `kubernetes`, `local` | `containers` | `containers` supports the repository preview lifecycle. `kubernetes` records the target but does not replace platform-specific manifests, ingress, secrets, autoscaling, or policy. `local` is not a production deployment profile. |
| Optional AI | `true`, `false` | `false` | Records product intent and requires `web` plus `api`. The base workspace intentionally includes no model-provider dependency; provider, safety, persistence, and evaluation choices remain explicit follow-up work. |

The generator rejects incompatible combinations before writing files. See `docs/template-initialization.md` for every option and validation rule.

## First local run

Create the local environment, start dependencies, apply the database schema, and run the selected applications:

```bash
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm db:status
pnpm dev
```

Default local endpoints are:

- web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Initialization rewrites these defaults when custom ports are selected. Start the optional local OpenTelemetry collector with `pnpm telemetry:up` when telemetry is enabled.

Before the first commit, run:

```bash
pnpm check
pnpm template:identity:check
git status --short
```

Stop local dependencies with `pnpm infra:down` and the telemetry collector with `pnpm telemetry:down`.

## Validate the production-shaped path

The container preview is the closest local equivalent to the required delivery workflow:

```bash
pnpm containers:build
pnpm preview:up
pnpm preview:smoke
pnpm performance:load
pnpm preview:down
```

`pnpm preview:down` should be safe to run again. Validation must leave the Git working tree clean.

## Production replacement points

Treat the following as explicit ownership decisions before a generated application is deployed:

1. **Identity:** replace development authentication with a production verifier and browser/session adapter; define issuer, audience, permissions, token or session renewal, and outage behavior.
2. **Secrets and configuration:** move credentials and environment-specific values out of repository files; use protected GitHub Environments or the target platform's secret manager.
3. **Data services:** provision production PostgreSQL and any selected Redis service with TLS, least-privilege credentials, backups, restore tests, retention, and capacity ownership.
4. **Worker delivery:** complete the selected transport's leasing or queue semantics, idempotency, retries, dead-letter handling, shutdown, and operational metrics.
5. **Distributed controls:** replace process-local rate limiting and any other single-process coordination used by multiple replicas.
6. **Telemetry:** configure the production exporter, sampling, redaction, retention, dashboards, alerts, and incident ownership.
7. **Deployment:** replace local Compose assumptions with owned image registry, domains, TLS, ingress, autoscaling, health probes, rollout, rollback, and environment policy.
8. **Seed and sample data:** remove or restrict development identities and sample records; define migration and data-repair ownership.
9. **Repository governance:** review CODEOWNERS, team access, required checks, branch protection, environments, dependency update policy, and release permissions.

Complete `docs/generated-project-checklist.md` before treating a generated repository as ready for shared development or deployment.
