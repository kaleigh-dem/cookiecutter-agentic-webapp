# Choosing Workspace Profiles

This page explains every supported initialization choice, its default, compatibility rules, generated effect, and production responsibility. Agentic development support is part of the baseline repository design and is not controlled by an initialization profile.

## Prerequisites

- A clean workspace created from the template.
- The intended product topology, repository owner, and local port constraints.

## Initialization command

Run from the workspace root:

```bash
pnpm initialize:workspace <WORKSPACE_NAME> \
  --displayName="<DISPLAY_NAME>" \
  --packageScope=<PACKAGE_SCOPE> \
  --repositoryOwner=<GITHUB_ORGANIZATION> \
  --codeowners=<CODEOWNERS> \
  --applications=web,api,worker \
  --webPort=3000 \
  --apiPort=4000 \
  --databasePort=5432 \
  --databaseName=<DATABASE_NAME> \
  --authentication=development \
  --workerTransport=postgres \
  --telemetry=false \
  --deploymentProfile=containers \
  --ai=false
```

After initialization:

```bash
pnpm install --frozen-lockfile
pnpm template:identity:check
```

The canonical schema is [`tools/workspace-plugin/src/generators/init/schema.json`](https://github.com/kaleigh-dem/steady-stack/blob/main/tools/workspace-plugin/src/generators/init/schema.json).

## Identity choices

| Option                      | Required | Default           | Effect                                                                                  |
| --------------------------- | -------- | ----------------- | --------------------------------------------------------------------------------------- |
| positional application slug | yes      | none              | Lowercase kebab-case identity used throughout generated files.                          |
| `--displayName`             | no       | derived from slug | Human-readable name.                                                                    |
| `--packageScope`            | yes      | none              | Lowercase npm scope such as `@acme`; rewrites internal packages and generator commands. |
| `--repositoryOwner`         | yes      | none              | GitHub user or organization; used for repository attribution and default ownership.     |
| `--codeowners`              | no       | repository owner  | Comma-separated `@user`, `@org/team`, or email owners.                                  |

The generator trims and deduplicates lists. Review `.github/CODEOWNERS` after generation; valid syntax does not prove that the named users or teams have repository access.

## Applications

`--applications` accepts a non-empty compatible subset of:

- `web`
- `api`
- `worker`

Default: all three.

Unselected applications are removed from `apps/`, root TypeScript references are updated, and container builds are scoped to selected applications.

Compatibility:

- Any authentication profile other than `none` requires `api`.
- `session` authentication requires both `web` and `api`.
- Selecting `worker` requires a non-`none` worker transport.
- Selecting a worker transport requires `worker`.
- `ai=true` requires `web` and `api`.

## Authentication

| Value         | Default           | Operational now                                                             | Adopter-owned production work                                                                                               |
| ------------- | ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `development` | when API selected | Deterministic local token and principal. Rejected in production.            | Never deploy this profile.                                                                                                  |
| `none`        | when API absent   | Browser sends no `Authorization` header.                                    | Explicitly decide which API routes are public; protected routes remain protected.                                           |
| `oidc`        | no                | Reference API verifier plus in-memory browser credential adapter.           | Provider login, callback, logout, secure-session token endpoint, client configuration, claim mapping, rotation, monitoring. |
| `session`     | no                | Same browser credential adapter, using an application-owned server session. | Session implementation, secure cookies, login/logout, renewal endpoint, server-side refresh handling.                       |

Selecting `oidc` or `session` does **not** complete provider integration.

## Worker transport

| Value      | Default              | Status                                                                                                                     |
| ---------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | when worker selected | Implemented baseline: transactional outbox polling, leasing, fencing, retries, failed-state inspection, replay, and drain. |
| `none`     | when worker absent   | Valid only without the worker.                                                                                             |
| `redis`    | no                   | Metadata-only future direction. It does not provision Redis, write `REDIS_URL`, or create a runnable adapter.              |

A custom transport must preserve at-least-once delivery, idempotency, lease or queue ownership, classified retries, quarantine/replay, bounded shutdown, tests, metrics, and operations.

## Telemetry

`--telemetry=true|false`, default `false`.

When true, initialization enables local OTLP defaults. Production still requires an owned collector or vendor backend, authentication, redaction, sampling, retention, dashboards, alerts, and incident ownership.

## Deployment profile

| Value        | Default | Meaning                                                                                                                                              |
| ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containers` | yes     | Supports production image targets and the checked-in preview Compose lifecycle.                                                                      |
| `kubernetes` | no      | Records the intended target only. No organization-specific manifests, ingress, secrets, policies, autoscaling, or rollout definitions are generated. |
| `local`      | no      | Development-only profile, not a production deployment.                                                                                               |

## Optional AI profile

`--ai=true|false`, default `false`.

This setting describes the **product being built**, not the development process. Every generated workspace retains the agent-compatible repository controls: `AGENTS.md` guidance, Nx graph and MCP configuration, generators, boundaries, validation, and upgrade tooling.

`true` records product intent to add AI-powered application capabilities and requires web plus API. Phase 14 now provides reusable upstream runtime primitives behind that optional boundary: a provider-neutral backend `ModelClient` with OpenAI native-`fetch` and deterministic adapters, typed tools with invocation-time authorization, the versioned V1 NDJSON browser stream, and reviewed prompt/evaluation evidence. These primitives are **not composed into the default applications**, and `ai=true` still does not generate a runnable model-backed workflow or install a provider-specific SDK.

The default profile remains free of model-provider runtime dependencies. Any application that composes the optional capabilities must make server-side provider/model choices and explicitly own data classification, retention, provider credentials, tool policy, evaluation budgets, and production operations. Durable execution is the next Phase 14 task; broader safety/fallback policy and generated runnable AI-profile composition remain later work.

See [Optional AI Runtime](Optional-AI-Runtime) for the implemented boundaries and current gaps, and [Agentic Development Model](Agentic-Development-Model) for the development operating model.

## Ports and database

| Option           | Default           | Validation                                   |
| ---------------- | ----------------- | -------------------------------------------- |
| `--webPort`      | `3000`            | Unique integer 1–65535.                      |
| `--apiPort`      | `4000`            | Unique integer 1–65535.                      |
| `--databasePort` | `5432`            | Unique integer 1–65535.                      |
| `--databaseName` | derived from slug | Lowercase letters, numbers, and underscores. |

Initialization rewrites `.env.example`, Compose configuration, health checks, and recorded metadata.

## Recording the selection

`workspace.template.json` is written after initialization. It records schema version, identity, selected applications, ports, database name, profiles, upstream repository, exact originating template version, and ownership-policy version. Commit this file; it is required for upgrades and provenance.

## Realistic examples

### Full local product workspace

```bash
pnpm initialize:workspace customer-portal \
  --displayName="Customer Portal" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --codeowners=@acme/platform,@acme/product \
  --applications=web,api,worker \
  --authentication=development \
  --workerTransport=postgres \
  --telemetry=false \
  --deploymentProfile=containers
```

### API and worker service without web

```bash
pnpm initialize:workspace billing-service \
  --displayName="Billing Service" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --codeowners=@acme/backend,@acme/platform \
  --applications=api,worker \
  --authentication=oidc \
  --workerTransport=postgres \
  --telemetry=true \
  --deploymentProfile=containers
```

### Public web and API with intentionally unauthenticated browser

```bash
pnpm initialize:workspace public-catalog \
  --displayName="Public Catalog" \
  --packageScope=@acme \
  --repositoryOwner=acme-web \
  --applications=web,api \
  --authentication=none \
  --workerTransport=none \
  --telemetry=true \
  --deploymentProfile=containers
```

Protected API routes do not become public automatically.

### Kubernetes target with custom ports

```bash
pnpm initialize:workspace operations-console \
  --displayName="Operations Console" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --applications=web,api,worker \
  --webPort=3100 \
  --apiPort=4100 \
  --databasePort=55432 \
  --databaseName=operations_console \
  --authentication=session \
  --workerTransport=postgres \
  --telemetry=true \
  --deploymentProfile=kubernetes
```

This records Kubernetes intent but does not generate deployable cluster manifests.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Optional AI Runtime](Optional-AI-Runtime)
- [Quick Start](Quick-Start)
- [Authentication and Authorization](Authentication-and-Authorization)
- [Production Readiness](Production-Readiness)

## Next steps

1. [Agentic Development Model](Agentic-Development-Model)
2. [Quick Start](Quick-Start)
3. [Optional AI Runtime](Optional-AI-Runtime)
4. [Repository Tour](Repository-Tour)

[Back to Home](Home)
