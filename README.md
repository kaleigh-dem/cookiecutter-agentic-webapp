# Agentic Webapp Nx Template

A production-minded Nx monorepo template for a large TypeScript web application operated by humans and coding agents.

> Upstream template: https://github.com/kaleigh-dem/cookiecutter-agentic-webapp. The repository name is retained from the original Cookiecutter prototype; generated workspaces use their configured identity throughout.

## Why Nx

Nx supplies the project graph, generators, architectural boundary enforcement, computation caching, affected-only CI, and coding-agent integration that a large monorepo needs. This repository adds opinionated web/backend boundaries, layered `AGENTS.md` guidance, and the application-specific platform pieces that Nx does not prescribe.

## Included now

- Next.js App Router web application
- NestJS API
- Node.js worker
- shared UI, contracts, and server environment packages
- pnpm workspaces
- enforced scope, runtime, and project-type boundaries
- Nx project graph, caching, affected commands, and local generators
- versioned Nx preset artifacts published through tagged GitHub Releases
- Nx MCP configuration and agent instructions
- PostgreSQL and Redis development services
- production OCI images, preview orchestration, release plans, and performance budgets
- GitHub Actions using standalone and affected Nx validation

## Create a workspace

```bash
npx create-nx-workspace@23.1.0 my-workspace \
  --template kaleigh-dem/cookiecutter-agentic-webapp
```

Or clone this repository directly while the template migration is under review.

After installing dependencies, replace the template identity and record the generated repository's profiles:

```bash
pnpm initialize:workspace my-workspace \
  --displayName="My Workspace" \
  --packageScope=@my-org \
  --repositoryOwner=my-org
pnpm install --frozen-lockfile
pnpm template:identity:check
```

Initialization rewrites package scopes, service and image names, Compose projects and labels, database defaults, telemetry identifiers, TypeScript conditions, CODEOWNERS, and other text-based identity surfaces. The generated `workspace.template.json` records the exact upstream template version. See `docs/template-initialization.md` for application selection, ownership, ports, database, authentication, worker, telemetry, deployment, optional AI settings, and the upstream-reference policy.

## Template releases

Template releases use semantic versions and `template-v<version>` tags. Each GitHub Release contains an installable workspace-plugin tarball. CI packages and installs the same artifact, invokes its public `preset` entry point, and verifies the generated manifest before the release workflow can publish it.

See `docs/template-releases.md` for versioning rules, release preparation, publishing, and artifact installation.

## Runtime requirements

Use Node.js 24 LTS and pnpm 10.13.1. The repository includes `.node-version` for compatible version managers, and `package.json` enforces the supported Node.js major release.

See `docs/runtime-support.md` for the support policy, compatibility lane, and validation coverage.

## Local development

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up
pnpm dev
```

## Validation

```bash
pnpm check
```

The validation contract includes workspace synchronization, generated contracts, formatting, security policy, delivery configuration, performance budgets, linting, typechecking, tests, and production builds. A production build must leave the Git working tree clean.

## Build and validate release artifacts

```bash
pnpm containers:build
pnpm preview:up
pnpm performance:load
pnpm preview:down
```

Generate an immutable, migration-ordered release plan:

```bash
node tools/delivery/release-plan.mjs \
  --environment production \
  --image-prefix ghcr.io/OWNER/agentic-webapp \
  --version 1.2.3
```

See `docs/delivery/`, `docs/runbooks/release-rollback.md`, and `docs/runbooks/disaster-recovery.md` before operating an environment.

## Generate approved structure

Use the local plugin instead of creating repeated structures manually:

```bash
pnpm generate:domain billing
pnpm generate:feature account-settings
pnpm generate:job refresh-search-index --queue=search
pnpm generate:contract project-created
```

Generator details and output contracts are documented in `tools/workspace-plugin/README.md`.

## Explore the workspace

```bash
pnpm graph
pnpm nx show projects
pnpm nx show project web
```

Read `AGENTS.md`, the closest nested `AGENTS.md`, and `docs/TODO.md` before changing a subsystem. Update the TODO ledger whenever a PR changes roadmap status or scope.
