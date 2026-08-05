# Database and Data Management

This page covers local PostgreSQL, migrations, seed data, status checks, destructive reset procedures, production ownership, and data safety.

## Prerequisites

- Docker running for local PostgreSQL.
- A `.env` file containing a PostgreSQL `DATABASE_URL`.
- Run commands from the workspace root.

## Start local PostgreSQL

```bash
pnpm infra:up
docker compose ps
```

The local service uses PostgreSQL 17, database `app`, user `postgres`, password `postgres`, and port 5432 before initialization rewrites.

Verify readiness:

```bash
docker compose exec postgres pg_isready -U postgres -d app
```

Inspect logs:

```bash
docker compose logs postgres
```

## Apply migrations

```bash
pnpm db:migrate
pnpm db:status
```

The migrator uses an advisory lock so only one runner applies migrations per database.

Expected `db:status` output is JSON containing `applied` and `pending`.

## Seed development data

```bash
pnpm db:seed
```

Development seeds are not production data. Do not run them against production.

## Create a migration

```bash
pnpm db:migration:create -- <MIGRATION_NAME>
```

Example:

```bash
pnpm db:migration:create -- add-projects
```

Expected result: the CLI prints the created migration path.

Review rules:

- Never edit a migration after merge.
- Add an explicit `down` implementation or document why reversal is impossible.
- Use expand-and-contract for risky schema changes.
- Keep large backfills resumable and outside long schema transactions.
- Add tests for repositories and invariants affected by the change.

Apply and verify:

```bash
pnpm db:migrate
pnpm db:status
pnpm nx run database:test
```

## Roll back one migration

> **Potentially destructive:** A down migration can remove schema or data. Confirm the target database, inspect migration status, and ensure a backup or disposable local database before proceeding.

Inspect first:

```bash
pnpm db:status
```

Rollback one:

```bash
pnpm db:rollback
```

Reapply:

```bash
pnpm db:migrate
pnpm db:status
```

A rollback is not a substitute for a backup.

## Reset a development database

> **Destructive:** `pnpm db:reset` rolls back all applied migrations, reapplies them, and reseeds. It removes application data from the target non-production database. Verify `DATABASE_URL` and preserve any needed data first.

Diagnostics:

```bash
node -e "const u=new URL(process.env.DATABASE_URL ?? require('fs').readFileSync('.env','utf8').match(/^DATABASE_URL=(.*)$/m)?.[1] ?? ''); console.log({host:u.host,database:u.pathname})"
pnpm db:status
```

Reset:

```bash
pnpm db:reset
```

The implementation refuses when `NODE_ENV=production`.

Verify:

```bash
pnpm db:status
```

## Remove the local Docker volume

> **Destructive:** This removes all PostgreSQL data in the Compose named volume.

Inspect:

```bash
docker compose ps
docker volume ls
```

Stop and remove:

```bash
docker compose down --volumes --remove-orphans
```

Recreate:

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm db:status
```

## Data ownership

Domain projects own business concepts and repository ports. `packages/database` owns PostgreSQL implementation details. Do not export Drizzle table types as domain types.

Transactions belong at application-use-case boundaries. The Agent Task create path writes the task and outbox event atomically.

## Production requirements

Before launch:

- Managed PostgreSQL with supported major version.
- TLS enforced by the connection URL.
- Least-privilege credentials per environment.
- Connection-pool limits reviewed against replica count.
- Automated backups and immutable/separately controlled retention.
- Tested isolated restores.
- Named migration, backup, data-repair, and capacity owners.
- Release ordering: validate, capture backup evidence, inspect/apply migration, deploy compatible code.
- No development seed or reset access.

## Backup and restore expectations

Before a destructive production migration:

1. Verify the latest backup.
2. Record the restore point and retention.
3. Test a restore into an isolated database.
4. Measure restore time against the RTO.
5. Confirm application/schema compatibility and rollout order.

The template provides process guidance, not a backup service.

## Related pages

- [Worker and Background Jobs](Worker-and-Background-Jobs)
- [Production Readiness](Production-Readiness)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [Worker and Background Jobs](Worker-and-Background-Jobs)
2. [Validation and Testing](Validation-and-Testing)

[Back to Home](Home)
