# Worker observability, readiness, and shutdown

The PostgreSQL worker exposes an internal operations endpoint, restores message context before dispatch, publishes queue and processing metrics, and drains claimed work during termination.

## Message context

Every claimed outbox message runs inside a structured logging context containing the identifiers available in its versioned contract:

- `requestId`
- `traceId`
- `userId`
- `actorId`
- `correlationId`
- `eventId`, equal to the durable outbox row ID
- `jobId`, equal to the durable outbox row ID

Agent Task consumer spans also include the task ID, event kind, receive count, and the same request, actor, correlation, trace, event, and job identifiers. Version 2 events restore the upstream `traceparent` when present. Legacy version 1 events remain processable and receive generated request and trace identifiers while preserving their actor, correlation, event, and job identity.

Worker lifecycle logs emitted while a message is being renewed, processed, retried, dead-lettered, or abandoned inherit this context. Prompt text and arbitrary exception details are not added to lifecycle logs.

## Metrics

The worker exports metrics through OpenTelemetry and exposes the process-local snapshot on its internal operations endpoint.

| Metric                                  | Type      | Meaning                                                                         |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `worker_queue_depth`                    | gauge     | Count of PostgreSQL outbox rows in `pending` or `processing` state.             |
| `worker_oldest_message_age_ms`          | gauge     | Age of the oldest non-terminal outbox row.                                      |
| `worker_message_processing_duration_ms` | histogram | Time spent dispatching and settling one claimed message.                        |
| `worker_retries_total`                  | counter   | Retry schedules successfully persisted by this worker process.                  |
| `worker_failures_total`                 | counter   | Permanent, exhausted, or quarantined messages successfully persisted as failed. |

Queue gauges come from PostgreSQL after each polling batch rather than from process-local claim counts. A metric refresh failure is logged safely and does not stop delivery; readiness separately reports whether PostgreSQL is reachable.

## Operations endpoint

The worker listens on `WORKER_OPERATIONS_PORT`, which defaults to `4001`.

- `GET /health/live` returns `200` while the process can serve requests. It does not depend on queue depth or PostgreSQL.
- `GET /health/ready` returns `200` only while the worker is accepting new work and PostgreSQL responds to a probe. It returns `503` while draining or when the required database dependency is unavailable.
- `GET /metrics` returns the current in-process metric snapshot for local diagnostics. Production monitoring should consume the configured OpenTelemetry metric exporter.

The preview Compose healthcheck calls `/health/ready`. The operations port is intentionally internal and is not published to the host by the baseline deployment.

## Shutdown and drain

`SIGINT` and `SIGTERM` initiate a two-stage shutdown:

1. Readiness changes to unavailable and the polling loop stops issuing new claim statements.
2. The current claimed batch continues processing with lease renewal active.
3. The worker waits up to `WORKER_DRAIN_TIMEOUT_MS`, which defaults to 25 seconds.
4. If the batch has not completed by the deadline, the worker aborts the remaining handler signal, records the claim as abandoned in logs, and does not acknowledge, retry, or dead-letter it under the terminating process.
5. The database claim remains fenced and becomes recoverable by another worker after its lease expires.
6. The operations server, database connections, and telemetry SDK close before the process stops.

The preview container uses a 30-second stop grace period, leaving time for the 25-second application drain and resource cleanup. Keep the application drain deadline shorter than the platform termination grace period and no longer than the operational tolerance for replacement capacity.

## Configuration

| Variable                  | Default | Constraint                                     |
| ------------------------- | ------- | ---------------------------------------------- |
| `WORKER_OPERATIONS_PORT`  | `4001`  | Integer from 1 through 65535.                  |
| `WORKER_DRAIN_TIMEOUT_MS` | `25000` | Integer from 1000 through 300000 milliseconds. |

`DATABASE_URL` remains required. A worker that cannot create its database connection or bind the operations endpoint fails startup rather than reporting false readiness.
