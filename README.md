# cookiecutter-agentic-webapp

A production-minded Cookiecutter template for scalable, agent-friendly TypeScript web applications.

## What it generates

- pnpm + Turborepo monorepo
- Next.js web app
- NestJS API and worker placeholders
- shared contracts, database, environment, observability, UI, and test packages
- architecture decisions and module-boundary documentation
- layered `AGENTS.md` instructions for coding agents
- GitHub Actions validation and CODEOWNERS
- PostgreSQL and Redis development services

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
python -m pip install -e '.[dev]'
pytest
```
