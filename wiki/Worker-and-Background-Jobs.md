# Worker and Background Jobs

This page explains the PostgreSQL outbox worker, leasing and fencing, delivery semantics, retries, failed-message operations, metrics, and shutdown.

## Prerequisites

- The `worker` application and `postgres` worker transport selected.
- PostgreSQL migrated and reachable through `DATABASE_URL`.

## Purpose

The worker handles durable asynchronous behavior outside the API request lifecycle. The baseline reference flow executes Agent Tasks created by the API.

PostgreSQL outbox polling is the only implemented transport. The `redis` profile records a future direction and is not runnable without an adopter-supplied adapter.

## Transactional outbox

The API writes application data and an outbox record in the same PostgreSQL transaction. The worker polls pending rows.

This solves the dual-write problem: the API cannot commit a task and then lose the corresponding work request because a separate queue publish failed.

## Leasing and fencing

A worker claims a bounded batch with:

- a lease expiry
- an ownership token
- receive count

The ownership token fences acknowledgements and retry transitions. If a worker loses its lease, a stale process cannot settle work claimed by another process.

## At-least-once delivery and idempotency

The system promises at-least-once delivery, not exactly once. A message may be delivered again after a crash or lease expiry.

Handlers must therefore be idempotent. The reference Agent Task handler uses:

- durable outbox row ID as idempotency identity
- receive count as execution fence
- conditional state transitions
- terminal duplicate detection
- claim-loss cancellation

## Retry classification

The worker allows five delivery attempts.

Retryable failures include explicit `RetryableJobError` and known transient network/PostgreSQL codes. Permanent failures include explicit `PermanentJobError`, contract/programming errors, and execution-state conflicts. Unknown exceptions are retried rather than destroying work on the first occurrence.

Retry delay is exponential: 1, 2, 4, 8, then capped at 60 seconds, with downward jitter up to 50%.

Failure persistence stores an allowlisted code and safe summary, not arbitrary exception text or payloads.

## Failed or quarantined work

List recent failed rows:

```bash
pnpm outbox:list-failed -- --limit=50
```

Filter:

```bash
pnpm outbox:list-failed -- \
  --kind=agent-task.execute.v2 \
  --error-code=dependency_timeout
```

The output includes safe identifiers, attempt data, failure metadata, and replay audit fields. It does not print event payloads or prompts.

## Replay

> **Operationally sensitive:** Replay can repeat external effects. Correct the root cause, confirm handler idempotency, and replay a bounded sample first. Never include secrets or payload data in the audit reason.

```bash
pnpm outbox:replay -- <FAILED_OUTBOX_UUID> \
  --by=<OPERATOR_IDENTITY> \
  --reason="<TICKET_OR_INCIDENT_REASON>"
```

Example:

```bash
pnpm outbox:replay -- 11111111-1111-4111-8111-111111111111 \
  --by=operator@example.com \
  --reason="Dependency recovered; incident INC-42"
```

Replay preserves the original outbox ID and prior safe failure evidence, resets delivery count for a new bounded cycle, records operator/reason, and returns a matching failed Agent Task to `queued`. A succeeded task is never regressed.

Verify by rerunning the failed list and observing service metrics.

## Operations endpoint

Default worker operations port: `4001`.

- `GET /health/live`: process can serve requests.
- `GET /health/ready`: accepting work and PostgreSQL reachable.
- `GET /metrics`: process-local snapshot for diagnostics.

Production monitoring should consume the configured OpenTelemetry exporter.

> **Preview note:** The checked-in preview Compose file currently maps `4001:4001` to support local smoke and load tests. The source worker operations document says the port is intended to be internal in baseline deployment. Treat public exposure as a deployment decision and do not expose it to untrusted networks.

## Metrics

| Metric | Meaning |
| --- | --- |
| `worker_queue_depth` | Pending or processing outbox rows. |
| `worker_oldest_message_age_ms` | Age of oldest non-terminal row. |
| `worker_message_processing_duration_ms` | Handler and settlement duration. |
| `worker_retries_total` | Persisted retry schedules. |
| `worker_failures_total` | Persisted terminal failures. |

Initial alert guidance from the repository:

- warning when failures increase or oldest age exceeds 120 seconds for 10 minutes
- critical for clustered terminal failures, readiness failure, or oldest age above 600 seconds
- immediate investigation for invalid contract/version/type, identity mismatch, or execution-state conflict

Tune thresholds from actual traffic and service objectives.

## Shutdown

`SIGINT` and `SIGTERM`:

1. mark readiness unavailable
2. stop new claims
3. keep lease renewal active for current batch
4. wait up to `WORKER_DRAIN_TIMEOUT_MS` (default 25 seconds)
5. abort remaining handler signals at deadline
6. leave unacknowledged claims recoverable after lease expiry
7. close operations, database, and telemetry resources

The preview container has a 30-second stop grace period. Keep platform termination grace longer than the application drain timeout.

## Alternative transports

An alternative adapter must implement:

- durable ownership
- at-least-once delivery
- fencing or equivalent stale-owner protection
- idempotent handler identity
- classified retry and terminal failure
- inspection and audited replay
- bounded shutdown
- capacity, health, metrics, alerts, backup/recovery, and tests

Selecting `redis` alone does none of this.

## Related pages

- [Database and Data Management](Database-and-Data-Management)
- [Architecture](Architecture)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [Validation and Testing](Validation-and-Testing)
2. [Containers and Preview Environments](Containers-and-Preview-Environments)

[Back to Home](Home)
