# ADR 0010: Deliver worker jobs through PostgreSQL outbox polling

- Status: Accepted
- Date: 2026-08-01

## Context

Agent Task creation already writes the task and a versioned execution event to `app.job_outbox` in one PostgreSQL transaction. The worker contains generated job contracts and handlers, but its deployed process only emits a heartbeat. Redis is present in local, preview, and production-shaped configuration even though no application code uses it.

The reference workflow needs a delivery design that is reliable with multiple worker replicas, recoverable after crashes, explicit about duplicate delivery, and small enough to remain a useful default for generated applications. The design must also leave room for adopters to replace PostgreSQL polling with a managed queue without coupling domain handlers to one transport.

## Decision

Use a transport boundary with a PostgreSQL outbox polling adapter as the only baseline implementation.

The outbox remains the durable source of truth. The API does not publish directly to a second broker, and the baseline does not dual-write PostgreSQL and Redis. Worker composition depends on a delivery port rather than issuing transport-specific commands from job handlers. A future queue adapter may implement the same delivery responsibilities, but it must add its own infrastructure, relay semantics, tests, and operational documentation before becoming a supported profile.

### Delivery port

The worker delivery boundary owns these operations:

1. claim a bounded batch of eligible messages with a lease;
2. expose the stored event kind, payload, identifiers, attempt count, and lease metadata to the dispatcher;
3. acknowledge successful processing;
4. reschedule retryable failures with a next-attempt time;
5. quarantine permanent, exhausted, unknown, or unsupported messages;
6. stop claiming new work and report whether in-flight work has drained.

Domain job handlers receive validated event data and execution context. They do not know whether the message came from PostgreSQL or a future broker.

### Claiming and concurrency

P11-02 will extend `app.job_outbox` with processing state, attempt count, next-attempt time, claim owner, claim expiration, and terminal failure information.

The PostgreSQL adapter claims rows in a short transaction using `FOR UPDATE SKIP LOCKED` or an equivalent atomic update. Eligible rows are ordered by `next_attempt_at`, then `created_at`, then `id`. The adapter updates the lease and attempt metadata before committing the claim transaction. Handlers run after that transaction commits, so database locks are not held while application work executes.

Multiple worker replicas may poll concurrently. At most one unexpired lease may own a row at a time. A worker crash leaves the row recoverable after its lease expires. Each process uses bounded batch size and bounded in-process concurrency; scaling is achieved by changing those limits or adding replicas rather than by allowing unbounded promises.

### Ordering

The baseline provides deterministic claim priority, not global FIFO execution.

Concurrent workers, retries, and slow handlers can complete messages out of creation order. Consumers must not depend on total ordering. Agent Task transitions will be conditional and monotonic so an older or duplicate message cannot regress terminal state. A workflow that requires strict per-aggregate ordering must introduce an explicit partition key and sequence policy in a later ADR rather than infer ordering from timestamps.

### Delivery guarantee and idempotency

Delivery is **at least once**.

A worker can complete a side effect and crash before acknowledging the outbox row, so the same message may be delivered again. Exactly-once execution is not claimed. The outbox row identifier is the message and idempotency key; generated event payloads also carry the job identifier. Handlers must make duplicate delivery safe through conditional state transitions, idempotency records, or idempotency keys passed to external systems.

When all state changes are in the same PostgreSQL database, the handler's durable state transition and the outbox acknowledgement should commit in one transaction. External side effects cannot share that transaction and therefore require their own idempotency contract.

### Retry and failure semantics

Failures are classified before the lease is released:

- retryable infrastructure and transient dependency failures are rescheduled with bounded exponential backoff and jitter;
- invalid payloads, unsupported event versions, unknown event kinds, and permanent business failures are quarantined without repeated execution;
- a retryable message that reaches the configured attempt limit moves to terminal dead-letter state;
- failure records retain the classification, safe error summary, attempt count, and relevant timestamps for inspection and replay.

A retry or replay is another at-least-once delivery and must use the original message identifier. Operators may replay quarantined work only through an explicit command that records who initiated the replay and why.

### Shutdown and observability

On `SIGINT` or `SIGTERM`, a worker stops polling first, waits for in-flight handlers for a bounded drain period, and then releases or allows leases to expire. Readiness requires the selected transport dependency; liveness does not depend on queue depth.

Logs, spans, and metrics carry the event, job, correlation, request, actor, and trace identifiers already present in the versioned contract. The baseline will measure claim latency, processing duration, retries, failures, queue depth, oldest eligible message age, active leases, and lease recovery.

### Redis

Remove Redis from the default local, preview, and production-shaped stack because it has no current delivery, caching, session, or distributed-control responsibility. Remove `REDIS_URL` from required baseline configuration. Redis may be introduced later by a concrete queue adapter or distributed rate limiter, with separate ownership, security, availability, backup, and cost decisions.

The initialization generator supports `postgres` as the worker transport when the worker application is selected and `none` when it is not. Unsupported transports are not recorded as selectable profiles.

## Alternatives considered

### Redis-backed queue as the baseline

Rejected for the current reference workflow. The transactional outbox would still need a reliable relay into Redis, preserving at-least-once behavior and adding another failure boundary. Redis would also become a required production service before the template demonstrates a workload that needs it.

### PostgreSQL-specific worker without a transport boundary

Rejected. PostgreSQL polling is the correct default, but job dispatch and handlers should not absorb claiming, acknowledgement, or retry details. A narrow delivery port keeps future broker adoption possible without weakening the baseline semantics.

### Exactly-once delivery

Rejected as a guarantee. A database transaction cannot atomically cover arbitrary external side effects. The design instead makes duplicates explicit and requires idempotent handling.

## Consequences

- Generated workspaces have one required durable service for the asynchronous reference path: PostgreSQL.
- Agent Task creation and delivery remain loss-resistant without a database-to-broker dual write.
- Polling adds database load, so batch size, poll interval, indexes, lease duration, and retention require measured defaults and operational metrics.
- Completion order is not guaranteed; handlers and state models must tolerate duplicates and reordering.
- Future Redis, cloud queue, or streaming adapters must preserve the documented claim, acknowledgement, retry, quarantine, shutdown, and observability semantics or record a superseding ADR.
- P11-02 through P11-07 implement and verify this decision; this ADR does not mark those tasks complete.
