# Template initialization

The released `preset` Nx generator captures the choices that distinguish one generated application repository from another. The root `initialize:workspace` command invokes this public entry point. Repeating the command with the same options produces byte-for-byte identical repository content.

```bash
pnpm initialize:workspace customer-portal \
  --displayName="Customer Portal" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --codeowners=@acme/platform,@acme/security \
  --applications=web,api,worker \
  --webPort=3100 \
  --apiPort=4100 \
  --databasePort=55432 \
  --databaseName=customer_portal \
  --authentication=oidc \
  --workerTransport=postgres \
  --telemetry=true \
  --deploymentProfile=containers \
  --ai=true
```

Initialization changes the local plugin package scope, so refresh workspace links before invoking another generator:

```bash
pnpm install --frozen-lockfile
pnpm template:identity:check
```

Use `docs/getting-started.md` for required local tooling, profile-selection guidance, the complete first-run sequence, preview validation, and production replacement points. Generated repository owners should complete `docs/generated-project-checklist.md` before opening the project to a team or connecting a deployment environment.

## Generated initialization contract

The preset writes `workspace.template.json` as the canonical, versioned record of initialization choices. Identity-neutral workspaces use schema version 2. The manifest contains:

- application slug, display name, and npm package scope
- repository owner and normalized CODEOWNERS
- selected `web`, `api`, and `worker` applications
- web, API, and database ports plus the database name
- authentication, worker transport, telemetry, deployment, and optional AI profiles
- the upstream template repository and exact originating template version used for attribution and future upgrade metadata

The public preset also removes template-maintainer-only release workflows, changelog files, release scripts, validation fixtures, and release commands. The generated workspace's local plugin remains available for structural generators but is marked private so it cannot be published accidentally.

The generated repository retains the downstream-facing onboarding, project checklist, runtime support, architecture, delivery, security, runbook, and template-upgrade documentation. These files are part of the generated handoff and must not depend on template-maintainer release permissions.

## Supported profile behavior

The generator accepts these profile values:

- `applications`: any non-empty compatible selection of `web`, `api`, and `worker`
- `authentication`: `development`, `none`, `oidc`, or `session`
- `workerTransport`: `none`, `postgres`, or `redis`
- `telemetry`: `true` or `false`
- `deploymentProfile`: `containers`, `kubernetes`, or `local`
- `ai`: `true` or `false`

Profile values are durable repository metadata, not a promise that every provider-specific production integration is complete. In particular:

- `development` authentication and `local` deployment are development-only choices.
- `oidc` and `session` identify the intended authentication boundary; the generated owner must configure and validate the production identity provider and browser/session flow.
- `postgres` and `redis` identify the worker transport direction; production delivery still requires owned leasing or queue semantics, retries, idempotency, dead-letter behavior, and shutdown handling.
- `kubernetes` records the deployment target but does not generate organization-specific cluster, ingress, secret, policy, or autoscaling configuration.
- `ai=true` records optional product intent without adding a model-provider dependency to the default workspace.

The complete compatibility rules and production replacement points are explained in `docs/getting-started.md`.

## Repository-wide identity replacement

Initialization rewrites every text file outside generated caches and dependency directories. It parameterizes:

- the internal npm scope and all workspace imports
- package names, generator commands, lockfile entries, and custom TypeScript conditions
- service, Compose project, telemetry, database-client, and application identifiers
- OCI image prefixes, image references, and deployment labels
- database defaults in environment files and Compose health checks
- generated CODEOWNERS and application-specific ownership paths

Binary files and ignored build directories are not modified. Intentional references to the upstream template, `kaleigh-dem/nx-fullstack-platform`, are preserved only in attribution, generator metadata, tests of that metadata, and `workspace.template.json`.

Applications omitted from `--applications` are removed from `apps/`, their root TypeScript project references are removed, and container builds are scoped to the selected applications.

## Validation rules

Initialization fails before writing files when options are invalid or incompatible:

- slugs must be lowercase kebab case; package scopes must be lowercase npm scopes
- repository owners and CODEOWNERS must use valid GitHub or email forms
- ports must be unique integers from 1 through 65535
- database names must use lowercase letters, numbers, and underscores
- authentication requires the API; session authentication also requires the web application
- a configured worker transport requires the worker application, and a selected worker requires a transport
- optional AI capabilities require both web and API applications

Lists are trimmed, deduplicated, and written in stable order. The manifest contains no timestamps or machine-specific paths.

`pnpm template:identity:check` scans the entire initialized repository and fails when it finds the upstream package scope, service slug, snake/camel/Pascal identity forms, or the original personal CODEOWNER outside the approved upstream metadata allowlist. CI runs initialization twice in a copied workspace, compares all text files, verifies the recorded template version and release-tool cleanup, executes this detector, and validates Nx synchronization without changing the source checkout.
