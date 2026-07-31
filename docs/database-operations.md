# Database operations

## Local workflow

```bash
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm db:status
```

Create a migration:

```bash
pnpm db:migration:create -- add-projects
```

Rollback one migration and reapply it:

```bash
pnpm db:rollback
pnpm db:migrate
```

Reset a non-production database:

```bash
pnpm db:reset
```

`db:reset` refuses to run when `NODE_ENV=production`.

## Review requirements

- Migration files are immutable after merge.
- Every migration needs an explicit `down` implementation or `down = false` with a written reason.
- Table or column drops, type narrowing, constraint tightening, and large rewrites require a rollout plan in the PR.
- Prefer expand-and-contract changes: add nullable or dual-write structures, backfill, switch reads, then remove old structures in a later release.
- Large backfills must be resumable and must not run inside a long schema migration transaction.

## Backup and restore

Before a destructive production migration:

1. Verify the latest automated backup completed successfully.
2. Record the restore point and retention window in the change ticket.
3. Test restore into an isolated database using the same PostgreSQL major version.
4. Measure restore duration against the recovery-time objective.
5. Confirm application deployment and migration ordering.

A database rollback is not a substitute for a backup. When a migration destroys or transforms data, recovery may require restoring a backup or applying a forward repair migration.

## Production execution

- Run migrations as a dedicated deployment step before starting code that requires the new schema.
- Use one migration runner per PostgreSQL instance; the migrator also uses an advisory lock.
- Do not run `db:reset` or development seeds against production.
- Review connection-pool limits alongside deployment concurrency.
