# Database

Node-only PostgreSQL infrastructure for the workspace.

## Responsibilities

- pooled PostgreSQL connections
- Drizzle runtime schema and query types
- reversible migrations and migration status
- deterministic development seeds and reset
- Agent Task repository and execution-state adapters
- transactional outbox persistence, lease-based delivery, failure inspection, and audited replay
- PostgreSQL-backed distributed rate-limit storage
- Testcontainers-backed integration coverage

## Commands

Run from the repository root:

```bash
pnpm db:migration:create -- descriptive-name
pnpm db:migrate
pnpm db:rollback
pnpm db:status
pnpm db:seed
pnpm db:reset
pnpm outbox:list-failed -- --limit=50
pnpm outbox:replay -- <outbox-id> --by=<operator> --reason="<ticket or incident>"
```

The database CLI loads the repository-root `.env` file through Node.js before validating `DATABASE_URL` and `NODE_ENV`. Existing exported environment variables take precedence over values in `.env`. `db:reset` refuses production mode.

## Boundaries

The package exports the database client from `@steadystack/database` and schema definitions from `@steadystack/database/schema`. Application use cases should depend on domain-facing repository and storage ports. Schema imports belong only in persistence adapters, migrations, database operations, and focused integration tests.

The Agent Task create use case writes the task and versioned outbox event in one transaction. Worker delivery claims rows with leases and ownership tokens; acknowledgement, renewal, retry, and terminal failure updates remain fenced. Rate-limit counters use atomic PostgreSQL updates shared by independent API replicas.

See `docs/database-operations.md`, ADR 0002, ADR 0010, ADR 0011, and `docs/worker-retry-and-dead-letter.md` before changing migration, outbox, replay, or distributed-control behavior.
