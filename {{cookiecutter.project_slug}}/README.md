# {{ cookiecutter.project_name }}

{{ cookiecutter.project_description }}

## Prerequisites

- Node.js {{ cookiecutter.node_version }}
- pnpm {{ cookiecutter.pnpm_version }}
- Docker with Compose

## Getting started

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm dev
```

## Core commands

```bash
pnpm check
pnpm test
pnpm build
pnpm infra:down
```

Read `AGENTS.md` before making changes and the closest nested `AGENTS.md` before editing a subsystem.
