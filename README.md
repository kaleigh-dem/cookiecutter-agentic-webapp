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
- Nx project graph, caching, affected commands, and generators
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
pnpm nx sync:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm affected
```

A production build must leave the Git working tree clean.

## Explore and generate

```bash
pnpm graph
pnpm nx show projects
pnpm nx show project web
pnpm nx g @nx/next:app apps/admin
pnpm nx g @nx/nest:lib packages/backend/example
```

Read `AGENTS.md` and the closest nested `AGENTS.md` before changing a subsystem.
