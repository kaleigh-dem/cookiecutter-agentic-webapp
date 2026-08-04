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
- recovery expectations for any implemented external queue adapter, including which data is durable or reconstructable;
- contacts and access paths for the incident commander and infrastructure owner.

The baseline PostgreSQL outbox transport has no separate queue service to restore. Its durable delivery state is recovered with PostgreSQL. Deployments that add Redis or another external queue must document that adapter's backup, reconstruction, replay, and consistency procedures separately.

## Recovery sequence

1. Declare the incident, assign an incident commander, and stop writes when they can worsen loss.
2. Identify the last known-good application version, database backup, migration state, and configuration version.
3. Create an isolated recovery environment. Never test a restore over the damaged production database.
4. Restore PostgreSQL and verify migration history, row counts, critical invariants, application ownership data, outbox delivery state, and distributed rate-limit schema.
5. If the deployment implements an external queue adapter, restore or recreate it from its documented durable sources and reconcile it with PostgreSQL before processing resumes. Treat ephemeral cache data as disposable.
6. Validate the recovered production configuration with `pnpm production:check -- <environment-file>`.
7. Deploy the compatible immutable application images.
8. Run the release smoke profile, authorization checks, and the baseline performance scenarios.
9. Compare recovered data to the declared recovery point and obtain incident-commander approval before switching traffic.
10. Re-enable writes gradually and observe service indicators through the recovery window.

## Restore testing

Run a restore exercise at least quarterly and after changing the database provider, backup policy, encryption keys, migration framework, major schema, or implemented delivery adapter. Record actual restore duration and data age; use those measurements to update RPO/RTO commitments.

## Post-incident

Preserve the timeline, backup identifiers, restored version, production-readiness output, smoke and performance results, and any data reconciliation. Track corrective work with owners and deadlines. Never declare recovery complete solely because containers are healthy; confirm business data, identity verification, authorization boundaries, outbox recovery, and distributed controls.
