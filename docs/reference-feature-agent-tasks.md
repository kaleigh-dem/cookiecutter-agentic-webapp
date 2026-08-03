# Agent Tasks reference feature

Agent Tasks is the canonical vertical example for contributors and coding agents. It demonstrates the expected dependency direction from a Next.js route through a browser feature and generated client, into NestJS presentation adapters, framework-free application/domain code, a Drizzle repository, PostgreSQL, a transactional outbox, and a deployed worker.

## Workflow

1. The browser creates a correlation identifier and calls the generated `createAgentTask` client method with a bearer access token. Local development and the repository-local preview use the deterministic development identity; generated production applications use the configured OIDC verifier and browser credential adapter.
2. The API authentication and authorization guards resolve the principal and require `agent-tasks:write` or `agent-tasks:read` as appropriate.
3. `CreateAgentTask` validates and normalizes the command, creates the domain entity, and produces the generated `AgentTaskExecutionRequested` contract.
4. `DrizzleAgentTaskRepository` writes the task and outbox event in one transaction.
5. The deployed worker claims the outbox row, validates the same versioned contract, and preserves the request, actor, user, trace, event, job, and correlation identifiers.
6. The stateful handler uses the outbox row ID as the idempotency key and the receive count as a fence while conditionally transitioning the task from `queued` to `running` and then `succeeded` or `failed`.
7. Terminal duplicate delivery is acknowledged without re-execution, stale ownership cannot acknowledge newer work, retryable failures are rescheduled with bounded backoff, and exhausted or permanent failures become inspectable dead letters.
8. Actor-scoped reads are authorized by the application use case before the API returns data.
9. The preview smoke gate creates an Agent Task through the deployed API and polls the read endpoint until the live worker transitions it to `succeeded`.

## Preview identity and smoke profiles

`infra/environments/preview.local.env` explicitly enables the deterministic development token for the repository-local preview stack. The shared preview Compose definition defaults the API to production mode unless that local override is supplied, and production environment validation rejects development-token configuration.

`tools/delivery/smoke-test.mjs` defaults to the `release` profile. That generic profile checks the web and API surfaces and does not require a worker operations URL or a development credential. Generated preview and production release plans pin this profile explicitly.

The repository-local preview sets `SMOKE_TEST_PROFILE=live-agent-task`. That profile adds worker liveness, readiness, and metrics checks and creates an authenticated Agent Task that must reach terminal `succeeded`. `WORKER_BASE_URL` and `AUTH_DEVELOPMENT_TOKEN` are required only for this local live-workflow profile.

The local preview identity is only a test adapter. It does not represent the Phase 12 production identity design.

## Where changes belong

- OpenAPI request/response changes: `packages/contracts/openapi/source`
- Runtime event changes: `packages/contracts/src/agent-task-execution-requested`
- Invariants and use cases: `packages/backend/agent-task`
- PostgreSQL schema and adapters: `packages/database`
- HTTP composition: `apps/api/src/app/agent-tasks`
- Browser states: `packages/web/features/agent-tasks`
- Route composition only: `apps/web/src/app/agent-tasks`
- Worker transport-independent behavior: `apps/worker/src/jobs/execute-agent-task`
- Preview workflow and service-level budgets: `tools/delivery`, `infra/deploy`, and `performance`

## Validation map

- Domain unit tests cover normalization, validation, persistence calls, and authorization.
- Contract tests cover the event schema and generated HTTP drift/compatibility.
- PostgreSQL Testcontainers tests cover migrations, the repository, the transactional outbox, two concurrent delivery owners, expired-lease crash recovery, retry scheduling, terminal failure, dead-letter inspection, and audited replay.
- Worker unit tests cover terminal duplicate delivery, stale-attempt rejection, successful transitions, retry exhaustion, permanent failure recording, and claim-loss cancellation.
- API unit tests cover principal-to-command mapping and permission boundaries.
- Playwright covers browser states and the generated client request shape without depending on a running backend.
- The live preview smoke creates and reads a real Agent Task across API, database, outbox, and worker boundaries and requires terminal success.
- Preview smoke and performance budgets exercise worker liveness, dependency-aware readiness, and metrics endpoints.
- Release-plan tests ensure generic preview and production smoke remain independent of development credentials and internal worker URLs.
- The generated-output smoke test ensures the source generators remain usable after this example evolves.
