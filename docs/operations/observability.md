# Observability contract

This document defines the vendor-neutral operational contract for the template. Exporters may change, but event names, correlation fields, health semantics, and service-level indicators must remain stable.

## Structured logs

Every log record is JSON and includes:

- `timestamp`
- `level`
- `service`
- a stable dot-separated `event` name
- correlation context when available
- structured attributes rather than interpolated prose

Stable platform events currently include:

- `http.request.started`
- `http.request.completed`
- `worker.started`
- `worker.heartbeat`
- `worker.stopped`

Feature events should use `<domain>.<action>.<outcome>`, for example `agent_task.create.succeeded`.

Never log request bodies, prompts, authorization headers, cookies, passwords, secrets, or tokens. The shared logger recursively redacts known sensitive keys, but callers remain responsible for passing the smallest useful attribute set.

## Correlation

The API accepts and propagates:

- `x-request-id`
- `x-correlation-id`
- `x-actor-id` until Phase 8 replaces it with authenticated identity
- W3C `traceparent`

When absent, the API creates a request identifier and trace identifier and returns them as `x-request-id` and `x-trace-id`. AsyncLocalStorage keeps that context available to downstream logging within the request lifecycle.

Worker jobs should create a context from the event's job, correlation, actor, and trace identifiers before executing application logic.

### Agent Task event rollout

Agent Task execution events use immutable versioned contracts and matching outbox kinds:

- `agent-task.execute.v1` contains the original task, actor, prompt, correlation, and occurrence fields.
- `agent-task.execute.v2` additionally requires user, request, trace, and job identifiers.

New producers write only v2 events. Workers accept both versions during the rollout window so existing v1 outbox rows and in-flight messages remain processable. For v1 events, the worker preserves the actor as the user identifier and the original correlation identifier, accepts the outbox job identifier from envelope metadata, and generates request and trace identifiers because those values did not exist in the v1 payload.

Do not remove v1 worker support until all environments have drained or migrated their v1 outbox rows and the oldest possible in-flight v1 message has expired. Removing a version requires an explicit deployment note and a test proving no persisted payload still depends on it.

## Health endpoints

- `GET /api/health/live` proves the process can serve requests. It must not call dependencies.
- `GET /api/health/ready` proves required dependencies are available. It returns HTTP 503 when any required probe fails.
- `GET /api/metrics` exposes a development-oriented snapshot of baseline counters and durations. Production exporters should consume the same metric names rather than scrape this JSON shape as a permanent protocol.

## Baseline service-level indicators

The first operational baseline is:

- request volume: `http_requests_total`
- request latency: `http_request_duration_ms`
- readiness success rate from `/api/health/ready`
- worker heartbeat freshness from `worker.heartbeat`

Initial service objectives should be set by a deploying product team after measuring realistic traffic. This template intentionally avoids inventing universal latency or availability targets.

## OpenTelemetry direction

The shared primitives are exporter-neutral. P7-02 and P7-06 will add OpenTelemetry SDK initialization and a local collector/exporter path. Instrumentation must preserve the stable fields and metric names defined here and must be safe to disable with configuration.
