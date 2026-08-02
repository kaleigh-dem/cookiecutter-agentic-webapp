# Worker retry and dead-letter operations

The baseline worker delivers Agent Task events at least once from PostgreSQL. It retries transient infrastructure failures and moves permanent or exhausted work to the failed outbox state for operator inspection.

## Retry policy

The worker allows five delivery attempts. Retryable failures use exponential delays of 1, 2, 4, 8, and then at most 60 seconds, with downward jitter of up to 50 percent. The receive count stored on the outbox row is the attempt number and is also the Agent Task execution fence.

Explicit `RetryableJobError` failures and known transient network or PostgreSQL codes are retryable. Explicit `PermanentJobError` failures, execution state conflicts, and programming or contract errors are permanent. Unknown exceptions are retried because an unclassified dependency failure should not destroy work on its first occurrence. Persisted failure metadata contains an allowlisted code and a constant safe summary; exception text is not stored or logged by the worker disposition path.

A retryable failure before the fifth attempt returns the outbox row to `pending` with a jittered `next_attempt_at`. The Agent Task remains resumable. A permanent failure or a retryable fifth failure marks both the current Agent Task attempt and the outbox row terminal.

## Inspect failed messages

Set `DATABASE_URL`, then list the newest failed rows:

```bash
pnpm outbox:list-failed -- --limit=50
```

Narrow the result by event kind or safe failure code:

```bash
pnpm outbox:list-failed -- --kind=agent-task.execute.v2 --error-code=dependency_timeout
```

The command returns message, task, correlation, version, attempt, safe error, failure, and replay audit fields. It does not print the event payload or Agent Task prompt.

Before replaying, identify the root cause and verify that it has been corrected. Do not replay an invalid contract, unsupported version, unknown event type, or business rejection until the producer, worker deployment, or business condition has changed.

## Replay a failed message

Replay is explicit and audited. Supply the operator identity and a ticket or incident reason; do not put credentials, prompts, request bodies, or other sensitive values in the reason.

```bash
pnpm outbox:replay -- 11111111-1111-4111-8111-111111111111 \
  --by=operator@example.com \
  --reason="Dependency recovered; incident INC-42"
```

Replay preserves the original outbox ID, previous safe failure evidence, and cumulative Agent Task execution-attempt count. It resets the outbox delivery count for a new bounded retry cycle, records the operator and reason, and atomically returns a matching failed Agent Task to `queued`. A succeeded task is never regressed. Replaying a row that is no longer failed is rejected.

After replay, confirm that the row leaves the failed list and reaches `processed`, or returns to failed with a new error and incremented replay audit count.

## Alert thresholds

Until P11-06 publishes queue metrics, poll the failed-message query and database age/count queries with the same operational monitoring used for PostgreSQL.

- **Warning:** any new failed row, three or more retry schedules for the same error code within 10 minutes, or an eligible pending row older than 2 minutes for 10 minutes.
- **Critical:** five or more new failed rows within 5 minutes, three failed rows with the same event kind and error code within 5 minutes, or an eligible pending row older than 10 minutes.
- **Immediate investigation:** `invalid_contract`, `unsupported_event_version`, `unsupported_event_type`, `idempotency_identity_mismatch`, or `execution_state_conflict`, because repeated replay will not repair these conditions by itself.

For a warning, inspect the safe metadata, correlate the message and task IDs with application traces, and check dependency health. For a critical alert, stop automated replay, preserve the failed rows, identify whether the failure is producer-wide or dependency-wide, and escalate through the service incident process. Replay only a bounded sample after the correction, then watch it reach terminal success before replaying additional rows.
