# ADR 0002: PostgreSQL data access and migrations

- Status: Accepted
- Date: 2026-07-31
- Tasks: P4-01, P4-04, P4-07

## Context

The workspace needs strongly typed PostgreSQL access without coupling domain projects to a persistence framework. Phase 4 also requires deterministic forward migrations, explicit rollback, migration status, isolated integration tests, and a path to operational review of destructive changes.

## Decision

Use three deliberately separate tools:

1. **Drizzle ORM 0.45.x** for runtime query construction and schema typing.
2. **node-postgres 8.x** for connection pooling and the underlying PostgreSQL driver.
3. **node-pg-migrate 9.x** for timestamped TypeScript migrations with `up` and `down` functions, advisory locking, and transactional execution.

The `packages/database` project owns these tools. Domain projects expose persistence ports using domain types and may not import Drizzle, `pg`, migration types, or database schemas. Application composition in an API or worker injects repository adapters.

## Why not use Drizzle Kit as the migration runner?

Drizzle Kit provides an effective code-first schema-diff workflow, but Phase 4 requires a first-class rollback command. `node-pg-migrate` makes reversible migrations explicit and executes migrations under transactions and an advisory lock. Drizzle remains the runtime query layer, so the migration lifecycle can evolve independently.

## Migration policy

- Every migration exports both `up` and `down`; irreversible migrations must set `down = false` and receive explicit review.
- Migrations use timestamp-prefixed filenames and are immutable after merge.
- The migration journal lives in the `infra` schema; application tables live in the `app` schema.
- CI applies migrations to an empty PostgreSQL database, rolls the latest migration back, reapplies it, and validates an upgrade from the previous migration boundary.
- Production rollback favors forward-fix migrations. The down command is an operational tool, not an automatic deployment policy.

## Query and transaction policy

- Database tables and columns use `snake_case`; TypeScript properties use `camelCase`.
- IDs are application-generated UUIDs unless an ADR approves a different identifier.
- All timestamps are `timestamptz` and stored in UTC.
- `created_at` is immutable. Repositories update `updated_at` explicitly in the same statement as the business change.
- Soft deletion is opt-in and represented by nullable `deleted_at`; it is never added reflexively.
- A use case owns its transaction boundary. Repository adapters accept a transaction-scoped database handle rather than opening nested transactions.

## Testing policy

Database integration tests use Testcontainers with the same PostgreSQL major version as local Compose. Tests own container startup and teardown and may not depend on a developer's local database.

## Consequences

- Persistence code remains isolated behind `type:data-access` boundaries.
- Migration authors must maintain rollback logic and understand PostgreSQL DDL.
- The runtime schema and migrations are reviewed together; schema diff generation is intentionally not authoritative.
- Container-backed tests are slower than unit tests but validate real PostgreSQL behavior.
