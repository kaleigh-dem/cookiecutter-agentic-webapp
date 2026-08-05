# Quick Start

This page provides the shortest reliable path from an empty parent directory to a locally running, agent-ready generated workspace. Run commands from the generated workspace root unless a step says otherwise.

## Prerequisites

- Git.
- Node.js 24.x. The repository `engines.node` range is `>=24 <25`.
- Corepack and pnpm 10.13.1.
- Docker Engine and Docker Compose v2.
- Permission to create and configure the target GitHub repository.

## 1. Verify local tooling

```bash
node --version
corepack enable
pnpm --version
docker version
docker compose version
```

Expected results:

- `node --version` reports `v24.x`.
- `pnpm --version` reports `10.13.1` or another compatible 10.x version; use the pinned version for reproducible results.
- Docker and Compose return version information without a daemon connection error.

The enforced versions are defined in [`package.json`](https://github.com/kaleigh-dem/nx-fullstack-platform/blob/main/package.json) and `.node-version`.

## 2. Create the workspace

From the directory that will contain the new repository:

```bash
npx create-nx-workspace@23.1.1 <WORKSPACE_NAME> \
  --template kaleigh-dem/nx-fullstack-platform
```

Concrete example:

```bash
npx create-nx-workspace@23.1.1 customer-portal \
  --template kaleigh-dem/nx-fullstack-platform
```

Then enter the workspace:

```bash
cd <WORKSPACE_NAME>
```

## 3. Install the pinned dependencies

```bash
corepack enable
pnpm install --frozen-lockfile
```

A frozen install verifies that `pnpm-lock.yaml` matches `package.json`. Do not replace this with an unfrozen install to work around a lockfile error; diagnose the mismatch first.

## 4. Initialize identity and profiles

```bash
pnpm initialize:workspace <WORKSPACE_NAME> \
  --displayName="<DISPLAY_NAME>" \
  --packageScope=<PACKAGE_SCOPE> \
  --repositoryOwner=<GITHUB_ORGANIZATION> \
  --codeowners=<CODEOWNERS> \
  --applications=web,api,worker \
  --authentication=development \
  --workerTransport=postgres \
  --deploymentProfile=containers
```

Example:

```bash
pnpm initialize:workspace customer-portal \
  --displayName="Customer Portal" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --codeowners=@acme/platform,@acme/security \
  --applications=web,api,worker \
  --authentication=development \
  --workerTransport=postgres \
  --deploymentProfile=containers
```

Initialization rewrites package scopes, service names, Compose identity, image names, database defaults, telemetry identifiers, TypeScript conditions, and CODEOWNERS. It records the choices in `workspace.template.json`.

Refresh workspace links and verify identity:

```bash
pnpm install --frozen-lockfile
pnpm template:identity:check
```

Expected result: the identity check exits successfully and reports no unapproved upstream identity.

## 5. Confirm the agent-facing workspace map

Review the repository-level instructions and project graph before assigning implementation work:

```bash
cat AGENTS.md
find apps packages tools -name AGENTS.md -print
pnpm nx show projects
pnpm nx show project web
cat .mcp.json
```

Expected result:

- the root `AGENTS.md` defines repository-wide rules;
- nested files identify more specific subsystem rules;
- Nx lists the selected projects and their targets;
- `.mcp.json` configures the Nx MCP server as `pnpm nx mcp` for compatible agent clients.

An agent should read the root and closest nested instructions, then inspect the relevant project and graph before editing. See [Agentic Development Model](Agentic-Development-Model).

## 6. Create the local environment file

```bash
cp .env.example .env
```

The default file configures:

- web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
- development bearer token: `local-development-token`
- in-memory local rate limiting
- telemetry disabled unless an OTLP endpoint is supplied

Never commit `.env`.

## 7. Start PostgreSQL

```bash
pnpm infra:up
docker compose ps
```

Expected result: the `postgres` service becomes healthy. The command uses PostgreSQL 17 and a named Docker volume.

Inspect startup failures with:

```bash
docker compose logs postgres
```

## 8. Apply migrations and development seed data

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:status
```

Expected result: `db:status` prints JSON showing all migrations under `applied` and an empty or expected `pending` list.

## 9. Start the applications

```bash
pnpm dev
```

This runs the available `dev` and `serve` targets through Nx, up to three in parallel. Leave this process running.

Open:

- web: `http://localhost:3000`
- API liveness: `http://localhost:4000/api/health/live`
- API readiness: `http://localhost:4000/api/health/ready`

Verify from another terminal:

```bash
curl --fail http://localhost:3000/
curl --fail http://localhost:4000/api/health/live
curl --fail http://localhost:4000/api/health/ready
```

## 10. Run repository validation

```bash
pnpm check
pnpm template:identity:check
git status --short
```

`pnpm check` validates synchronization, generated contracts, compatibility, formatting, security policy, delivery configuration, performance budgets, linting, type checking, tests, and production builds. The identity check is separate. `git status --short` should be empty after validation.

## 11. Stop services

Stop the foreground development command with `Ctrl+C`, then run:

```bash
pnpm infra:down
pnpm telemetry:down
```

`infra:down` stops local Compose services but retains the PostgreSQL volume.

### Remove local PostgreSQL data

> **Destructive:** The following command removes the local named volume and all data stored in it. Confirm that the Compose project is the generated workspace and that no needed local data remains.

First inspect:

```bash
docker compose ps
docker volume ls
```

Then remove services and volumes:

```bash
docker compose down --volumes --remove-orphans
```

Verify:

```bash
docker compose ps --all
```

## First-run troubleshooting

### Unsupported Node.js or pnpm version

Use a Node version manager that reads `.node-version`, run `corepack enable`, and repeat the version checks. Do not use Node 26 because the repository currently treats it as a non-blocking compatibility lane, not a supported runtime.

### Frozen lockfile failure

Confirm that initialization was followed by the second frozen install. If files were edited before initialization, restore them or start from a clean workspace. See [Troubleshooting](Troubleshooting).

### Docker unavailable

Run `docker version`. If the client cannot reach the daemon, start Docker Desktop or the system Docker service before running infrastructure commands.

### PostgreSQL not healthy

```bash
docker compose ps
docker compose logs postgres
```

Check whether port 5432 is already used and whether an old incompatible volume exists. Do not delete the volume until you have confirmed its data is disposable.

### Port already in use

Use the profile generator’s `--webPort`, `--apiPort`, and `--databasePort` options during initialization, or stop the conflicting process. See [Choosing Workspace Profiles](Choosing-Workspace-Profiles).

### Browser or API cannot connect

Confirm `.env`, service health, and the compiled `NEXT_PUBLIC_API_BASE_URL`. Browser-visible variables are build-time values for production images.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Choosing Workspace Profiles](Choosing-Workspace-Profiles)
- [Troubleshooting](Troubleshooting)
- [Validation and Testing](Validation-and-Testing)

## Next steps

1. [Repository Tour](Repository-Tour)
2. [Everyday Development](Everyday-Development)

[Back to Home](Home)
