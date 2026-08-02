# Agent Tasks reference feature

Agent Tasks is the canonical vertical example for contributors and coding agents. It demonstrates the expected dependency direction from a Next.js route through a browser feature and generated client, into NestJS presentation adapters, framework-free application/domain code, a Drizzle repository, PostgreSQL, and a versioned worker event.

## Workflow

1. The browser creates a correlation identifier and calls the generated `createAgentTask` client method.
2. The API reads the temporary `x-actor-id` request-context adapter. Phase 8 replaces this adapter with authenticated identity without changing the application use cases.
3. `CreateAgentTask` validates and normalizes the command, creates the domain entity, and produces the generated `AgentTaskExecutionRequested` contract.
4. `DrizzleAgentTaskRepository` writes the task and outbox event in one transaction.
5. The deployed worker claims the outbox row, validates the same versioned contract, and preserves the request, actor, trace, job, and correlation identifiers.
6. The stateful handler uses the outbox row ID as the idempotency key and the receive count as a fence while conditionally transitioning the task from `queued` to `running` and then `succeeded` or `failed`. Terminal duplicate delivery is acknowledged without re-execution, while stale attempts cannot regress newer or terminal state.
7. Actor-scoped reads are authorized by the application use case before the API returns data.

## Where changes belong

- OpenAPI request/response changes: `packages/contracts/openapi/source`
- Runtime event changes: `packages/contracts/src/agent-task-execution-requested`
- Invariants and use cases: `packages/backend/agent-task`
- PostgreSQL schema and adapters: `packages/database`
- HTTP composition: `apps/api/src/app/agent-tasks`
- Browser states: `packages/web/features/agent-tasks`
- Route composition only: `apps/web/src/app/agent-tasks`
- Worker transport-independent behavior: `apps/worker/src/jobs/execute-agent-task`

## Validation map

- Domain unit tests cover normalization, validation, persistence calls, and authorization.
- Contract tests cover the event schema and generated HTTP drift/compatibility.
- PostgreSQL Testcontainers tests cover migrations, the repository, the transactional outbox, fenced execution attempts, terminal transitions, and persisted support metadata.
- Worker unit tests cover terminal duplicate delivery, stale-attempt rejection, successful transitions, failure recording, and claim-loss cancellation.
- API unit tests cover header-to-command mapping.
- Playwright covers browser states and the generated client request shape.
- The generated-output smoke test ensures the source generators remain usable after this example evolves.
