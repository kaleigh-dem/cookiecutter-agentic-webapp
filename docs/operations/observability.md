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

## Correlation and tracing

The API accepts and propagates:

- `x-request-id`
- `x-correlation-id`
- W3C `traceparent`

When absent, the API creates a request identifier and trace identifier and returns them as `x-request-id` and `x-trace-id`. AsyncLocalStorage keeps that context available to downstream logging within the request lifecycle. Authenticated identity comes from the verified bearer principal; clients must not use `x-actor-id` to supply identity.

OpenTelemetry initializes for four service identities:

- `web-browser`
- `web-server`
- `api`
- `worker`

Browser fetch instrumentation sends W3C trace context to the configured API origin. The API captures the active `traceparent` in v2 Agent Task events, and the worker restores it around job execution. The request, user, job, and correlation identifiers remain structured attributes and log context so traces can be joined with operational logs.

### Agent Task event rollout

Agent Task execution events use immutable versioned contracts and matching outbox kinds:

- `agent-task.execute.v1` contains the original task, actor, prompt, correlation, and occurrence fields.
- `agent-task.execute.v2` additionally requires user, request, trace, and job identifiers and may carry W3C `traceparent` context.

New producers write only v2 events. Workers accept both versions during the rollout window so existing v1 outbox rows and in-flight messages remain processable. For v1 events, the worker preserves the actor as the user identifier and the original correlation identifier, accepts the outbox job identifier from envelope metadata, and generates request and trace identifiers because those values did not exist in the v1 payload.

Do not remove v1 worker support until all environments have drained or migrated their v1 outbox rows and the oldest possible in-flight v1 message has expired. Removing a version requires an explicit deployment note and a test proving no persisted payload still depends on it.

## OpenTelemetry configuration

Telemetry is disabled unless an OTLP endpoint is explicitly configured. This keeps tests, generated workspaces, and deployments without a collector network-silent.

Node runtimes read standard OpenTelemetry variables:

- `OTEL_EXPORTER_OTLP_ENDPOINT` for a shared OTLP/HTTP base URL
- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` for signal-specific URLs
- `OTEL_SDK_DISABLED=true` to force the SDK off
- `OTEL_METRIC_EXPORT_INTERVAL` for metric export cadence; values below one second are rejected
- `OTEL_SERVICE_VERSION` and `OTEL_DEPLOYMENT_ENVIRONMENT` for resource attributes

The browser uses build-time public equivalents:

- `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`
- `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `NEXT_PUBLIC_OTEL_SDK_DISABLED=true`
- `NEXT_PUBLIC_OTEL_DEPLOYMENT_ENVIRONMENT`
- `NEXT_PUBLIC_API_BASE_URL` to constrain which origin receives propagated trace headers

A shared OTLP base URL is normalized to `/v1/traces` and `/v1/metrics`. Signal-specific endpoint variables are used exactly as supplied.

## Local collector workflow

The optional local Collector receives OTLP over HTTP and gRPC and writes traces and metrics through its debug exporter:

```bash
pnpm telemetry:check
pnpm telemetry:up
cp .env.example .env
# Set both OTLP endpoint values in .env to http://localhost:4318
pnpm dev
pnpm telemetry:logs
```

Use `pnpm telemetry:down` to stop only the Collector. `pnpm infra:down` still stops the full local stack.

The local Collector is a development inspection path, not a production topology. Production deployments must use authenticated and encrypted exporter endpoints, restrict browser CORS to deployed web origins, apply retention controls in the backend, and avoid exposing OTLP receiver ports publicly.

## Health endpoints

- `GET /api/health/live` proves the process can serve requests. It must not call dependencies.
- `GET /api/health/ready` proves required dependencies are available. It returns HTTP 503 when any required probe fails.
- `GET /api/metrics` exposes a development-oriented snapshot of baseline counters and durations. The same metric names are also recorded through the OpenTelemetry meter when the SDK is enabled.

## Baseline service-level indicators

The first operational baseline is:

- request volume: `http_requests_total`
- request latency: `http_request_duration_ms`
- readiness success rate from `/api/health/ready`
- worker heartbeat freshness from `worker.heartbeat`

Initial service objectives should be set by a deploying product team after measuring realistic traffic. This template intentionally avoids inventing universal latency or availability targets.
