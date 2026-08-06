# Troubleshooting

This page is organized by observable symptom. Each entry includes likely causes, diagnostics, resolution, and verification.

## Prerequisites

- Run diagnostics from the workspace root unless stated otherwise.
- Preserve logs and the working tree before destructive recovery.

## CI failed but the console log is insufficient

**Symptom:** A required workflow failed, was superseded, or ended without enough evidence in the visible step log.

**Diagnose:** Confirm the workflow run belongs to the exact pull-request head SHA. A cancelled run may only indicate that a newer commit superseded it.

PR #55 implemented retained failure artifacts. Download the bundle that matches the failed workflow:

- `ci-failure-<run_id>-<run_attempt>` for Playwright evidence and `release-plan.json`;
- `delivery-failure-<run_id>-<run_attempt>` for `service-logs.txt` and `performance-report.json`;
- `generated-workspace-diagnostics-<run_id>-<run_attempt>` for generated-repository evidence.

The artifacts are retained for 14 days.

**Resolve:** Inspect the first failed operation, then reproduce the smallest matching command locally. Cache loss may slow a container build but must not affect correctness.

```bash
rm -rf .cache/buildkit ../buildkit-cache
unset BUILDKIT_CACHE_ENABLED
unset BUILDKIT_CACHE_DIR
pnpm nx run web-feature-agent-tasks:e2e
pnpm containers:build
pnpm preview:up
pnpm preview:smoke
pnpm performance:load
pnpm preview:down
```

**Verify:** Rerun the focused command and then the applicable repository contract. Review [CI Diagnostics](CI-Diagnostics) for trace inspection, artifact lookup, generated-workspace bundles, and release-plan guidance.

## Unsupported Node.js or pnpm version

**Symptom:** Install warns or fails on `engines`; commands behave differently from CI.

**Likely causes:** Node is not 24.x; Corepack selected a different pnpm.

**Diagnose:**

```bash
node --version
pnpm --version
cat .node-version
node -p "require('./package.json').engines"
node -p "require('./package.json').packageManager"
```

**Resolve:** Activate the `.node-version` runtime, run `corepack enable`, and use pnpm 10.13.1.

**Verify:**

```bash
pnpm install --frozen-lockfile
pnpm sync:check
```

## Frozen-lockfile installation failure

**Symptom:** `pnpm install --frozen-lockfile` reports that the lockfile is out of date.

**Likely causes:** `package.json` changed without the lockfile; initialization changed package identity and the required second install was skipped; artifact version mismatch.

**Diagnose:**

```bash
git status --short
git diff -- package.json pnpm-lock.yaml
```

**Resolve:** Restore an accidental manifest change, or intentionally run `pnpm install` to update the lockfile and review the diff. After initialization, run the documented second frozen install.

**Verify:**

```bash
pnpm install --frozen-lockfile
```

## Docker is unavailable

**Symptom:** Infrastructure, integration tests, image build, or preview fails to connect to Docker.

**Diagnose:**

```bash
docker version
docker info
docker compose version
```

**Resolve:** Start Docker Desktop or the system daemon, ensure the user can access the socket, and free disk space.

**Verify:**

```bash
docker run --rm hello-world
```

## PostgreSQL does not start

**Symptom:** `pnpm infra:up` starts but PostgreSQL is unhealthy or exits.

**Likely causes:** Port conflict, incompatible/corrupt local volume, insufficient disk, invalid generated Compose values.

**Diagnose:**

```bash
docker compose ps
docker compose logs postgres
docker volume ls
```

Check port:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

**Resolve:** Stop the conflicting service or use an initialized custom port. Remove the volume only when local data is disposable.

**Verify:**

```bash
docker compose exec postgres pg_isready -U postgres -d app
pnpm db:status
```

## Migration failure

**Symptom:** `pnpm db:migrate` exits non-zero.

**Likely causes:** Database unreachable, invalid `DATABASE_URL`, migration conflict, partial schema state, insufficient privileges.

**Diagnose:**

```bash
pnpm db:status
docker compose logs postgres
grep '^DATABASE_URL=' .env
```

**Resolve:** Correct connectivity/permissions. Do not edit an already-merged migration. For disposable development data, use the documented reset after confirming the URL. For shared data, create a forward repair migration or follow an approved rollback/restore plan.

**Verify:**

```bash
pnpm db:migrate
pnpm db:status
pnpm nx run database:test
```

## Port already in use

**Symptom:** Web, API, worker operations, or PostgreSQL cannot bind.

**Diagnose:**

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:4000 -sTCP:LISTEN
lsof -nP -iTCP:4001 -sTCP:LISTEN
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

**Resolve:** Stop the process or initialize with unique `--webPort`, `--apiPort`, and `--databasePort`. Worker operations currently defaults to 4001 and may require an application configuration change when another service uses it.

**Verify:** Restart and call health endpoints.

## Web or API cannot connect

**Symptom:** Browser shows network errors or API readiness fails.

**Diagnose:**

```bash
curl -v http://localhost:3000/
curl -v http://localhost:4000/api/health/live
curl -v http://localhost:4000/api/health/ready
grep -E '^(WEB_ORIGIN|NEXT_PUBLIC_API_BASE_URL|API_PORT)=' .env
```

**Likely causes:** Service not running; wrong API URL; CORS origin mismatch; web image compiled with another public URL; database unavailable.

**Resolve:** Start the correct targets, correct `.env`, rebuild the web image after `NEXT_PUBLIC_*` changes, and inspect API logs.

**Verify:** All curl commands succeed and browser requests target the expected origin.

## Authentication fails locally

**Symptom:** Protected requests return 401.

**Diagnose:**

```bash
grep -E '^(NEXT_PUBLIC_AUTHENTICATION_PROFILE|AUTH_ACCESS_TOKEN_VERIFIER|AUTH_DEVELOPMENT_TOKEN)=' .env
```

**Resolve:** For local development, align browser profile and API verifier with `development` and use the same token. Do not use development authentication in a production build.

**Verify:** Run the Agent Task flow or focused API tests.

## OIDC discovery or JWKS failure

**Symptom:** API returns `503 identity_provider_unavailable`.

**Diagnose:**

```bash
curl --fail "<AUTH_OIDC_ISSUER>/.well-known/openid-configuration"
```

Inspect issuer and `jwks_uri`, then:

```bash
curl --fail "<JWKS_URI>"
```

**Likely causes:** Network/DNS/TLS failure, wrong issuer path, issuer mismatch, non-HTTPS JWKS, malformed metadata, empty/unusable key set.

**Resolve:** Correct provider configuration and reachability. Do not widen algorithm policy or enable the development verifier.

**Verify:** Exercise valid and rotated-key tokens; rerun:

```bash
pnpm nx run api:test --skip-nx-cache
```

## Worker jobs are not processing

**Symptom:** Tasks remain queued; worker readiness fails; queue age grows.

**Diagnose:**

```bash
curl -v http://localhost:4001/health/live
curl -v http://localhost:4001/health/ready
curl -v http://localhost:4001/metrics
pnpm outbox:list-failed -- --limit=50
docker compose logs worker
```

**Likely causes:** Worker stopped, database unreachable, migration missing, lease contention, permanent failures, unsupported event version/type.

**Resolve:** Restore PostgreSQL and worker readiness, inspect safe failure codes, correct the root cause, then replay a bounded sample when safe.

**Verify:** Queue depth and oldest age fall; task reaches terminal success.

## Rate limiting behaves unexpectedly

**Symptom:** Unexpected 429, inconsistent replicas, or `503 rate_limit_unavailable`.

**Diagnose:**

```bash
grep -E '^API_RATE_LIMIT_|^API_TRUSTED_PROXY_HOPS|^AUTH_OIDC_TENANT_CLAIM' .env
pnpm db:status
```

Inspect response headers `Retry-After` and `X-Rate-Limit-Policy`.

**Likely causes:** Threshold too low, incorrect trusted proxy hops, malformed client address, missing tenant claim, PostgreSQL unavailable, production accidentally configured with memory store.

**Resolve:** Correct topology and thresholds, keep production on PostgreSQL, migrate the rate-limit table, and validate under representative multi-replica traffic.

**Verify:** Expected policy is named in headers and counters are shared.

## Preview smoke tests fail

**Symptom:** `preview:up` or `preview:smoke` reports a failed check.

**Diagnose:**

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  ps
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  logs --no-color
```

Run smoke directly:

```bash
node tools/delivery/smoke-test.mjs
```

**Resolve:** Fix the first unhealthy dependency, verify migrations, authentication profile, base URLs, and worker processing.

**Verify:**

```bash
pnpm preview:smoke
pnpm performance:load
```

## Validation changes generated files

**Symptom:** `pnpm check` or generation leaves a dirty tree.

**Diagnose:**

```bash
git status --short
git diff
pnpm contracts:check
pnpm sync:check
pnpm format:check
```

**Resolve:** If source legitimately changed, run the appropriate generator or formatter and commit outputs. If output is unintended, restore source or generated files and investigate nondeterminism. Never hand-edit generated contracts.

**Verify:**

```bash
pnpm check
git status --short
```

## Working tree is dirty after a build

**Symptom:** Production build modifies tracked files.

**Diagnose:**

```bash
git status --short
git diff --stat
git diff
```

**Resolve:** Identify whether Nx sync, contract generation, Next output, or a custom script wrote a tracked path. Generated outputs must be deterministic and committed; build caches/output directories must be ignored.

**Verify:**

```bash
git diff --exit-code
```

## Template identity validation fails

**Symptom:** `pnpm template:identity:check` reports upstream package/service/CODEOWNER identity.

**Likely causes:** Initialization skipped, manual copy restored template names, a new text surface was not rewritten, or an intentional upstream attribution is outside the allowlist.

**Diagnose:**

```bash
pnpm template:identity:check
git diff
```

Use the file paths printed by the checker.

**Resolve:** Rerun initialization only on an appropriate clean workspace or manually correct the unintended identity. Do not remove legitimate upstream provenance from `workspace.template.json`.

**Verify:**

```bash
pnpm template:identity:check
```

## Upgrade conflicts occur

**Symptom:** Dry-run reports conflicts or manual follow-up.

**Diagnose:**

```bash
pnpm exec steadystack-upgrade --to "<TARGET_VERSION>" --dry-run
git status --short
```

**Resolve:** Review ownership class and release notes. Merge structured changes into customized generated-once files. Apply product changes manually for application-owned files. Rerun dry-run until conflicts are understood.

**Verify:**

```bash
pnpm exec steadystack-upgrade --to "<TARGET_VERSION>" --dry-run
pnpm check
```

## Related pages

- [Quick Start](Quick-Start)
- [Validation and Testing](Validation-and-Testing)
- [CI Diagnostics](CI-Diagnostics)
- [SteadyStack Identity Migration](SteadyStack-Identity-Migration)
- [Releases and Upgrades](Releases-and-Upgrades)

## Next steps

1. [CI Diagnostics](CI-Diagnostics)
2. [Documentation Audit](Documentation-Audit)

[Back to Home](Home)
