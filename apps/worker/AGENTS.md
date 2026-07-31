# Worker application instructions

- Jobs must be idempotent and safe to retry.
- Log structured identifiers, never secrets or full payloads.
- Business behavior belongs in backend libraries shared with the API, not in the worker bootstrap.
- Every external side effect needs an explicit timeout and retry policy.
- Validate changes with `pnpm nx run worker:typecheck` and `pnpm nx run worker:build`.
