# Runbook: degraded dependencies

## Readiness is failing

1. Call `GET /api/health/live`. If it fails, treat the API process as unavailable and restart or roll back the deployment.
2. Call `GET /api/health/ready` and identify the failed dependency by name.
3. Preserve the response's request and trace identifiers when escalating.
4. Check recent `http.request.completed` and dependency-specific events for the same identifiers.
5. Restore the dependency before adding capacity to the API. A readiness failure is not fixed by routing more traffic to an unhealthy instance.

### PostgreSQL

- Confirm `DATABASE_URL` points to the intended environment.
- Check connection limits, TLS requirements, DNS, and network policy.
- Run `pnpm db:status` from an authorized environment.
- Follow `docs/operations/database.md` before restore, reset, or destructive migration actions.

## Worker heartbeat is stale

1. Search for the last `worker.heartbeat` event by service and deployment revision.
2. Check whether `worker.stopped` was emitted cleanly.
3. Verify the worker process, queue connectivity, and resource limits.
4. Restart only after preserving failed job identifiers and correlation identifiers.
5. Do not replay jobs until their idempotency behavior is understood.

## Elevated errors or latency

- Compare `http_requests_total` with `http_request_duration_ms`.
- Group failures by stable event name, route, status code, and deployment revision.
- Never paste prompts, cookies, authorization headers, or secrets into an incident channel.
- Prefer rollback when a new revision correlates strongly with the degradation and database compatibility permits it.

## Escalation record

Capture:

- start and end time in UTC
- affected service and deployment revision
- readiness report
- stable event names
- request, trace, correlation, and job identifiers
- mitigation and rollback actions
- follow-up owner
