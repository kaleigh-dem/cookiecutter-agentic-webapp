# Agentic Webapp Nx Template

A production-minded Nx monorepo template for a large TypeScript web application operated by humans and coding agents.

> Upstream template: https://github.com/kaleigh-dem/nx-fullstack-platform. Generated workspaces use their configured identity throughout.

## Why Nx

Nx supplies the project graph, generators, architectural boundary enforcement, computation caching, affected-only CI, and coding-agent integration that a large monorepo needs. This repository adds opinionated web/backend boundaries, layered `AGENTS.md` guidance, and the application-specific platform pieces that Nx does not prescribe.

## Included now

- Next.js App Router web application
- NestJS API with replaceable development and OIDC access-token verification
- Node.js worker
- shared UI, contracts, and server environment packages
- pnpm workspaces
- enforced scope, runtime, and project-type boundaries
- Nx project graph, caching, affected commands, and local generators
- versioned Nx preset artifacts, downstream migrations, and upgrade ownership policy
- Nx MCP configuration and agent instructions
- PostgreSQL development service and optional OpenTelemetry collector
- production OCI images, preview orchestration, release plans, and performance budgets
- GitHub Actions using standalone, affected, and generated-workspace validation
- generated-repository onboarding and governance checklists

## Create a workspace

```bash
npx create-nx-workspace@23.1.0 my-workspace \
  --template kaleigh-dem/nx-fullstack-platform
```

After installing dependencies, replace the template identity and record the generated repository's profiles:

```bash
pnpm initialize:workspace my-workspace \
  --displayName="My Workspace" \
  --packageScope=@my-org \
  --repositoryOwner=my-org
pnpm install --frozen-lockfile
pnpm template:identity:check
```

Initialization rewrites package scopes, service and image names, Compose projects and labels, database defaults, telemetry identifiers, TypeScript conditions, CODEOWNERS, and other text-based identity surfaces. The generated `workspace.template.json` records the exact upstream template version and upgrade ownership-policy version.

Start with `docs/getting-started.md` for required tooling, supported application and infrastructure profiles, first-run commands, and production replacement points. See `docs/template-initialization.md` for every generator option and validation rule.

## Template releases

Template releases use semantic versions and `template-v<version>` tags. Each GitHub Release contains an installable workspace-plugin tarball with the public `preset` entry point and the `agentic-webapp-upgrade` command. CI validates generation, a previous-release upgrade fixture, and a differently named generated repository through frozen installation, validation, migrations, seed data, production images, preview smoke tests, performance budgets, deterministic teardown, identity checks, and Git-cleanliness checks before publication.

See `docs/template-releases.md` for versioning and publishing, `docs/template-validation.md` for the generated-workspace lifecycle, and `docs/template-upgrades.md` for downstream migrations.

## Upgrade a generated workspace

Install the target release artifact temporarily and preview its ordered migration plan:

```bash
pnpm add --save-dev ./downloaded-workspace-plugin-0.2.0.tgz
pnpm exec agentic-webapp-upgrade --to 0.2.0 --dry-run
```

After reviewing ownership classes and conflicts, rerun with `--apply`, execute `pnpm check`, and commit the upgrade separately from application changes. Applied migrations synchronize the repository-local `pnpm template:upgrade` command.

## Runtime requirements

Use Node.js 24 LTS and pnpm 10.13.1. The repository includes `.node-version` for compatible version managers, and `package.json` enforces the supported Node.js major release.

See `docs/runtime-support.md` for the support policy, compatibility lane, and validation coverage.

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The complete first-run and shutdown sequence is documented in `docs/getting-started.md`.

## Authentication

Local development uses the deterministic development verifier selected in `.env.example`. Production defaults to the OIDC discovery/JWKS verifier and requires an exact issuer, one or more audiences, an algorithm allowlist, and claim mapping. See `docs/oidc-authentication.md` for configuration, rotation, cache, validation, and outage behavior. The production browser credential acquisition and refresh adapter remains a separate integration boundary.

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

## Production readiness

A generated repository is not production-ready solely because its local and preview paths pass. Complete `docs/generated-project-checklist.md` to configure repository access, CODEOWNERS, required checks, branch protection, environments, secrets, release permissions, operational ownership, and deployment evidence. The production replacement points are listed in `docs/getting-started.md`.

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
