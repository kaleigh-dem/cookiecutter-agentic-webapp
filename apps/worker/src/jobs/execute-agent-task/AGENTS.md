# ExecuteAgentTask job guidance

- Treat payloads as versioned contracts.
- Preserve correlation identifiers in logs and downstream calls.
- Make retries idempotent before enabling automatic retry behavior.
- Keep queue clients out of the handler's core logic.
