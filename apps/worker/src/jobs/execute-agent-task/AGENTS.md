# ExecuteAgentTask job guidance

- Treat payloads as immutable, versioned contracts and validate them before dispatch.
- Preserve request, actor, user, tenant, correlation, trace, event, and job identifiers in logs and downstream calls.
- Use the outbox row ID as the idempotency identity and the receive count as the execution fence.
- Keep duplicate delivery, stale ownership, retry, and terminal-state transitions monotonic and safe.
- Classify failures through the shared retry/permanent error boundary so Agent Task state and outbox disposition remain consistent.
- Honor claim-loss and shutdown cancellation before committing external side effects.
- Keep PostgreSQL claiming, acknowledgement, and queue clients out of the handler's core logic.
