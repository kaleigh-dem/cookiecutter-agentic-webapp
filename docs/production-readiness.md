# Production readiness gate

`pnpm production:check` is the fail-closed configuration gate for a production release. It reads `infra/environments/production.env` by default; pass another file after `--` when validating an external or temporary environment file.

```bash
cp infra/environments/production.env.example infra/environments/production.env
# Replace every example value without committing the resulting file.
pnpm production:check
```

The gate does not contact external systems or print secret values. It reports configuration field names and reasons only.

## Required production properties

The gate combines the shared deployment validator with production-only checks:

- `DEPLOYMENT_ENVIRONMENT=production` and `NODE_ENV=production`
- the running Node major satisfies the repository `engines.node` range
- `AUTH_ACCESS_TOKEN_VERIFIER=oidc`, no development token, and no development browser profile
- no example placeholders or local hostnames in production values
- `WEB_ORIGIN` is a single HTTPS origin suitable for the API CORS boundary
- the public API, OIDC issuer, and OpenTelemetry exporter use non-local HTTPS endpoints
- the PostgreSQL URL has credentials, a non-local host, and `sslmode=require`, `verify-ca`, or `verify-full`
- `API_RATE_LIMIT_STORE=postgres`
- `OTEL_EXPORTER_OTLP_ENDPOINT` is present and `OTEL_SERVICE_VERSION` matches `APP_VERSION`
- `BACKUP_OWNER` names the accountable person or team that records the pre-migration snapshot identifier

The gate validates configuration, not provider reachability. Release smoke tests, migration inspection, backup evidence, and platform health checks remain separate ordered release-plan steps.

## Promotion workflow

Production promotion runs through `.github/workflows/promote.yml` and the protected `production` GitHub Environment. Store the complete production environment file in that Environment's masked multiline `PRODUCTION_ENVIRONMENT` secret. Configure required reviewers and allow deployments only from `main`.

The workflow downloads `release-manifest.json` from one successful **Release images** run on `main`, exports its validated build values, and compares them with the protected production contract:

- `APP_VERSION`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_AUTHENTICATION_PROFILE`
- `NEXT_PUBLIC_AUTH_SESSION_ENDPOINT`

A mismatch fails promotion. This prevents approving one production configuration while deploying a web image compiled with another.

The promotion workflow writes the secret to a permission-restricted temporary file, runs the gate, verifies the image signatures and attestations, and generates the production release plan. It does not rebuild, retag, or push images.

## Secret handling

Do not commit `infra/environments/production.env`. Keep the Environment secret limited to production approvers, rotate it whenever contained credentials change, and review workflow logs to ensure future changes do not print the file. Prefer platform workload identity or secret references over long-lived embedded credentials when the deployment platform supports them.
