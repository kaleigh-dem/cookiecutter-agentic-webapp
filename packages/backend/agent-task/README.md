# Agent Task domain

Canonical reference domain for the template. It is framework-free and owns the Agent Task lifecycle independently of HTTP, NestJS, Drizzle, PostgreSQL, and worker transport details.

## Responsibilities

- prompt validation and normalization
- task creation with actor-scoped ownership
- actor-scoped reads
- persistence ports used by application use cases
- transactional creation of the versioned execution request
- conditional execution transitions from `queued` to `running` and then `succeeded` or `failed`
- idempotency and fencing rules that prevent duplicate or stale delivery from regressing terminal state

Infrastructure adapters live in `packages/database`; HTTP composition lives in `apps/api`; worker execution lives in `apps/worker/src/jobs/execute-agent-task`; public request, response, and event contracts live in `packages/contracts`.

## Validation

```bash
pnpm nx run backend-agent-task:test
pnpm nx run backend-agent-task:typecheck
pnpm nx run backend-agent-task:build
```

See `docs/reference-feature-agent-tasks.md` for the complete browser-to-worker flow.
