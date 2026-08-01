# Release rollback runbook

## Trigger

Use this runbook when a newly deployed version causes elevated errors, failed health checks, unacceptable latency, authorization failures, or data corruption risk.

## Immediate actions

1. Declare the incident and stop further releases.
2. Record the current version, previous version, deployment timestamps, migration identifiers, and database backup identifier.
3. Check liveness, readiness, error rate, P95 latency, queue depth, and database health.
4. Disable or isolate the failing entry point when continued traffic can increase damage.

## Choose rollback or roll-forward

Prefer a roll-forward fix when any migration has been applied unless all of the following are true:

- the previous application version is compatible with the current schema;
- no new required data shape is being written;
- the rollback was exercised in preview or staging;
- the incident commander approves the compatibility assessment.

When those conditions hold, deploy the previous immutable image tags for web, API, and worker. Do not rebuild an old commit.

Do not automatically execute `pnpm db:rollback`. Database rollback is allowed only when the migration has a verified down path, no incompatible writes have occurred, and a restorable snapshot is available. Otherwise, keep the schema and roll the application forward.

## Verification

After changing versions:

1. Wait for service health checks.
2. Run `tools/delivery/smoke-test.mjs` against the environment.
3. Re-run the performance scenarios relevant to the incident.
4. Verify new errors have stopped and backlog is draining.
5. Observe for one complete rollback window before closing the incident.

## Follow-up

Preserve logs, traces, release plan, backup identifier, and timeline. Add a regression test and update performance budgets or runbooks only when supported by measured evidence.
