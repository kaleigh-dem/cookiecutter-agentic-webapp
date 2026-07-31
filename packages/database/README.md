# Database

Node-only PostgreSQL infrastructure for the workspace.

## Responsibilities

- pooled PostgreSQL connections
- Drizzle runtime schema and query types
- reversible migrations and migration status
- deterministic development seeds and reset
- database integration-test helpers

## Commands

Run from the repository root:

```bash
pnpm db:migration:create -- descriptive-name
pnpm db:migrate
pnpm db:rollback
pnpm db:status
pnpm db:seed
pnpm db:reset
```

The package exports the database client from `@agentic-webapp/database` and schema definitions from `@agentic-webapp/database/schema`. Consumers should depend on domain-facing repository interfaces instead of importing schema objects directly, except inside persistence adapters.
