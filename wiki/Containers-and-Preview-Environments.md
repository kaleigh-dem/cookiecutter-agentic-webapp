# Containers and Preview Environments

This page documents the production-shaped local workflow: image build, preview startup, smoke and performance checks, diagnostics, teardown, and cleanup.

## Prerequisites

- Docker Engine and Compose v2.
- Dependencies installed.
- Ports 3000, 4000, 4001, and 5432 available unless the generated configuration rewrites them.
- The checked-in `infra/environments/preview.local.env` or a compatible generated equivalent.

## How preview differs from normal development

Normal development runs source processes through Nx and uses `compose.yaml` only for PostgreSQL and optional telemetry.

Preview:

- builds production OCI images
- starts PostgreSQL plus containerized API, worker, and web
- applies migrations as a separate step
- waits for health checks
- runs deployed smoke tests
- uses the release-shaped configuration parser
- removes containers, networks, and volumes during teardown

Preview is closer to delivery, but it is still local Compose. It does not prove production DNS, TLS, ingress, managed identity, secrets, autoscaling, backups, or platform rollout.

## Build images

Set public web build variables before building:

```bash
export NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
export NEXT_PUBLIC_AUTHENTICATION_PROFILE=development
export NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=
export NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS=30
pnpm containers:build
```

Default tags:

```text
steadystack-api:local
steadystack-worker:local
steadystack-web:local
```

Override with `API_IMAGE`, `WORKER_IMAGE`, `WEB_IMAGE`, `APP_VERSION`, and `GITHUB_SHA`.

## BuildKit cache behavior

PR #55 implemented cache-aware container builds. Container targets use `docker buildx build --load`. Local execution remains uncached by default. Cache-capable CI jobs explicitly set `BUILDKIT_CACHE_ENABLED=true` and use service-scoped caches. Delivery restores `.cache/buildkit`; Generated workspace sets `BUILDKIT_CACHE_DIR` to the sibling path `../buildkit-cache` so the cache remains outside the temporary generated repository.

When cache is enabled, the build imports a service cache only when it exists, exports into a separate next directory, and replaces the current cache only after a successful build. GitHub Actions cache restore is non-blocking.

The cache is an optimization, not a correctness dependency. Cache loss may make a run slower but must not change the Dockerfile, target, build arguments, tag, or resulting image for the same inputs.

Reproduce the deterministic fallback:

```bash
rm -rf .cache/buildkit ../buildkit-cache
unset BUILDKIT_CACHE_ENABLED
unset BUILDKIT_CACHE_DIR
pnpm containers:build
```

Set `BUILDKIT_CACHE_DIR` only when an enabled cache should live outside the default `.cache/buildkit` path.

## Start preview

```bash
pnpm preview:up
```

`preview:up` already:

1. validates `preview.local.env`
2. builds images
3. starts and waits for PostgreSQL
4. applies migrations through `MIGRATION_DATABASE_URL`
5. starts API, worker, and web
6. runs the configured smoke test

Therefore, running `pnpm containers:build` immediately before `preview:up` is optional but useful when you want to isolate image build failures.

Inspect:

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  ps
```

## Run smoke tests explicitly

```bash
pnpm preview:smoke
```

The environment selects the smoke profile. The repository-local preview uses `live-agent-task`, which validates the real API → PostgreSQL → outbox → worker flow.

For an explicit generic release profile:

```bash
node tools/delivery/smoke-test.mjs --profile release
```

Required base URL environment variables must be set.

## Run performance validation

```bash
pnpm performance:load
```

The local preview environment supplies API, web, and worker base URLs. Failures report scenarios exceeding P95 latency or error-rate budgets.

## Inspect services and logs

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  ps
```

All logs:

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  logs --no-color
```

One service:

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  logs --no-color api
```

Health checks:

```bash
curl --fail http://localhost:3000/
curl --fail http://localhost:4000/api/health/live
curl --fail http://localhost:4000/api/health/ready
curl --fail http://localhost:4001/health/live
curl --fail http://localhost:4001/health/ready
curl --fail http://localhost:4001/metrics
```

## Retained Delivery diagnostics

A failed Delivery run captures preview Compose output in `service-logs.txt` and writes machine-readable load-test output to `performance-report.json` when produced. GitHub Actions uploads them as:

```text
delivery-failure-<run_id>-<run_attempt>
```

The artifact is retained for 14 days. Download it before rerunning a long-lived investigation. Start with `service-logs.txt` for startup, health, migration, authentication, and worker symptoms. Start with `performance-report.json` for a performance-budget failure, then correlate the failing scenario with service logs.

See [CI Diagnostics](CI-Diagnostics) for the full artifact lookup and local reproduction sequence.

## Shut down

```bash
pnpm preview:down
```

The command runs Compose `down --remove-orphans --volumes`. It removes preview data. It is intended to be safe to run again.

Verify:

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  ps --all
```

## Cleanup after failure

Always try:

```bash
pnpm preview:down
```

If a wrapper failed before normal teardown:

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  down --remove-orphans --volumes
```

Inspect labeled leftovers before removing anything else:

```bash
docker ps -a
docker network ls
docker volume ls
```

Do not use broad `docker system prune --volumes` on a shared development machine; it can remove unrelated data.

## Build-time versus runtime configuration

`NEXT_PUBLIC_*` values are embedded in the web image. A runtime environment override cannot change an existing web bundle. Rebuild from reviewed source when API URL, browser authentication profile, or session endpoint changes.

Node-service secrets and private endpoints belong at runtime, not in build arguments.

## Real production deployment

The repository builds and can push images, but does not deploy them to a production platform. A real deployment must add:

- registry and provenance policy
- TLS, DNS, ingress, and network policy
- secret/config injection
- managed database and backups
- health/readiness integration
- scaling and disruption policy
- migration job
- rollout and rollback controller
- telemetry backend
- environment approval and evidence

## Related pages

- [Validation and Testing](Validation-and-Testing)
- [CI Diagnostics](CI-Diagnostics)
- [Production Readiness](Production-Readiness)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [CI Diagnostics](CI-Diagnostics)
2. [Production Readiness](Production-Readiness)
3. [Releases and Upgrades](Releases-and-Upgrades)

[Back to Home](Home)
