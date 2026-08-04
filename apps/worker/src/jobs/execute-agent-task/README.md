# Execute Agent Task job

This job consumes the versioned `agent-task.execute.v1` and `agent-task.execute.v2` contracts from the PostgreSQL transactional outbox. It is registered by the worker composition root; the handler itself remains independent of the delivery adapter.

## Responsibilities

- validate the shared event contract before executing business behavior
- restore request, actor, user, trace, event, job, and correlation context
- use the durable outbox row ID as the idempotency key and receive count as a fence
- transition Agent Tasks conditionally from `queued` to `running` and then `succeeded` or `failed`
- treat terminal duplicate delivery as a no-op
- classify retryable, permanent, contract, and execution-state failures consistently with outbox disposition
- honor claim-loss and shutdown cancellation without acknowledging stale work

PostgreSQL claiming, lease renewal, acknowledgement, retry scheduling, quarantine, and replay live in the worker delivery and database adapters. See `docs/adr/0010-worker-delivery.md`, `docs/worker-operations.md`, and `docs/worker-retry-and-dead-letter.md`.

## Validation

```bash
pnpm nx run worker:test
pnpm nx run worker:typecheck
pnpm nx run worker:build
```

The live preview smoke profile proves the deployed API, database, outbox, and worker complete this workflow end to end.
