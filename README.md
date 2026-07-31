# cookiecutter-agentic-webapp

A production-minded Cookiecutter template for scalable, agent-friendly TypeScript web applications.

## Phase 1 scope

This initial scaffold generates:

- a pnpm and Turborepo monorepo
- a Next.js web application
- a NestJS API
- an optional TypeScript worker
- shared contracts, database, and validated environment packages
- layered `AGENTS.md` instructions for coding agents
- architecture decisions and module-boundary documentation
- generated-project GitHub Actions validation and CODEOWNERS
- PostgreSQL and optional Redis development services

Planned follow-up work includes executable dependency-boundary enforcement, database migrations and integration tooling, OpenAPI generation, observability, shared UI and test packages, authentication, and a complete vertical example feature.

## Use

```bash
pipx run cookiecutter gh:kaleigh-dem/cookiecutter-agentic-webapp
```

Or from a local checkout:

```bash
cookiecutter .
```

## Template development

```bash
python -m pip install -e '.[test]'
python -m pytest -v
```
