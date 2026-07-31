# Agentic Webapp Nx Template

A production-minded Nx monorepo template for a large TypeScript web application operated by humans and coding agents.

> The repository name is retained from the original Cookiecutter prototype. The template itself now uses Nx directly.

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
- Nx MCP configuration and agent instructions
- PostgreSQL and Redis development services
- GitHub Actions using standalone and affected Nx validation

## Create a workspace

```bash
npx create-nx-workspace@23.1.0 my-workspace \
  --template kaleigh-dem/cookiecutter-agentic-webapp
```

Or clone this repository directly while the template migration is under review.

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

The expanded validation contract is:

```bash
pnpm sync:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

A production build must leave the Git working tree clean.

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
