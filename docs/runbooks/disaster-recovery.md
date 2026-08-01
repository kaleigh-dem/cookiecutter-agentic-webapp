# Disaster recovery runbook

## Recovery objectives

Each deployment must define and test its own recovery point objective (RPO) and recovery time objective (RTO). Until a stricter service agreement is approved, the template recommends an initial target of:

- RPO: no more than 24 hours of durable data loss;
- RTO: restore a minimal read/write service within four hours.

These are starting targets, not guarantees. Record provider-specific backup frequency, retention, replication, and restore timings before production launch.

## Required evidence

Maintain:

- automated PostgreSQL backups with immutable or separately controlled retention;
- periodic restore tests into an isolated environment;
- versioned application images and release plans;
- configuration and secret recovery procedures;
- Redis/queue recovery expectations, including which data is reconstructable;
- contacts and access paths for the incident commander and infrastructure owner.

## Recovery sequence

1. Declare the incident, assign an incident commander, and stop writes when they can worsen loss.
2. Identify the last known-good application version, database backup, migration state, and configuration version.
3. Create an isolated recovery environment. Never test a restore over the damaged production database.
4. Restore PostgreSQL and verify migration history, row counts, critical invariants, and application ownership data.
5. Recreate Redis and queues from durable sources where possible. Treat ephemeral cache data as disposable.
6. Validate deployment configuration with `tools/delivery/validate-environment.mjs`.
7. Deploy the compatible immutable application images.
8. Run smoke tests, authorization checks, and the baseline performance scenarios.
9. Compare recovered data to the declared recovery point and obtain incident-commander approval before switching traffic.
10. Re-enable writes gradually and observe service indicators through the recovery window.

## Restore testing

Run a restore exercise at least quarterly and after changing the database provider, backup policy, encryption keys, migration framework, or major schema. Record actual restore duration and data age; use those measurements to update RPO/RTO commitments.

## Post-incident

Preserve the timeline, backup identifiers, restored version, validation output, and any data reconciliation. Track corrective work with owners and deadlines. Never declare recovery complete solely because containers are healthy; confirm business data and authorization boundaries.
