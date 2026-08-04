# Runbook: degraded dependencies

## API readiness is failing

1. Call `GET /api/health/live`. If it fails, treat the API process as unavailable and restart or roll back the deployment.
2. Call `GET /api/health/ready` and identify the failed dependency by name.
3. Preserve the response's request and trace identifiers when escalating.
4. Check recent `http.request.completed` and dependency-specific events for the same identifiers.
5. Restore the dependency before adding capacity to the API. A readiness failure is not fixed by routing more traffic to an unhealthy instance.

### PostgreSQL

- Confirm `DATABASE_URL` points to the intended environment.
- Check connection limits, TLS requirements, DNS, and network policy.
- Run `pnpm db:status` from an authorized environment.
- Follow `docs/database-operations.md` before restore, reset, or destructive migration actions.

### Identity provider

- Separate `identity_provider_unavailable` from invalid-token or permission-denial responses.
- Confirm OIDC discovery and JWKS endpoints are reachable from every API replica over HTTPS.
- Do not switch production to the development verifier or bypass authorization.
- Follow `docs/security/identity-operations.md` for signing-key rotation and outage handling.

### Rate-limit store

- Treat `503 rate_limit_unavailable` as a PostgreSQL-backed control failure, not as permission to bypass limits.
- Check database health, migration state, and rate-limit adapter errors.
- Confirm replicas remain configured with `API_RATE_LIMIT_STORE=postgres`.

## Worker readiness or heartbeat is failing

1. Call the internal worker `GET /health/live` and `GET /health/ready` endpoints.
2. Search for the last `worker.heartbeat` event by service and deployment revision.
3. Check whether `worker.stopped` was emitted cleanly or the process entered its drain state.
4. Verify PostgreSQL reachability, outbox claim age, queue depth, and oldest-message-age metrics.
5. Preserve failed outbox IDs, task IDs, and correlation identifiers before restarting.
6. Do not replay failed rows until their failure classification and idempotency behavior are understood.

Follow `docs/worker-operations.md` for readiness and shutdown behavior and `docs/worker-retry-and-dead-letter.md` for inspection and replay.

## Elevated errors or latency

- Compare `http_requests_total` with `http_request_duration_ms`.
- Group failures by stable event name, route, status code, and deployment revision.
- Review worker processing duration, retries, terminal failures, queue depth, and oldest-message age when asynchronous work is affected.
- Never paste prompts, cookies, authorization headers, or secrets into an incident channel.
- Prefer rollback when a new revision correlates strongly with the degradation and database compatibility permits it.

## Escalation record

Capture:

- start and end time in UTC
- affected service and deployment revision
- readiness report
- stable event names
- request, trace, correlation, task, event, and job identifiers
- mitigation and rollback actions
- follow-up owner
