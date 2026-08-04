# Containers and deployment configuration

## Build images

Run all production image targets:

```bash
pnpm containers:build
```

The default local tags are:

- `agentic-webapp-api:local`
- `agentic-webapp-worker:local`
- `agentic-webapp-web:local`

Override tags and image metadata through `API_IMAGE`, `WORKER_IMAGE`, `WEB_IMAGE`, `APP_VERSION`, and `GITHUB_SHA`. Set `NEXT_PUBLIC_API_BASE_URL` and the selected public browser authentication variables before building the web image because browser-visible values are compiled into the bundle.

API and worker images use `infra/docker/Dockerfile.node-service`. The builder compiles the workspace, stages compiled workspace packages, and runs `pnpm deploy --prod --legacy` to prune development dependencies. The runtime image contains only the deployed service graph and runs as the unprivileged `node` user.

The web image uses `infra/docker/Dockerfile.web` and Next.js standalone output. It also runs as the unprivileged `node` user.

## Validate configuration

Checked-in examples live under `infra/environments`:

- `preview.env.example`
- `production.env.example`
- `preview.local.env` for CI and local image validation

Copy the appropriate example to an untracked `.env` file, replace every placeholder through the deployment platform's secret/configuration system, and validate the production contract:

```bash
pnpm production:check -- infra/environments/production.env
```

The fail-closed production gate checks semantic application versions, the supported Node.js runtime, OIDC and browser authentication profiles, HTTPS origins and endpoints, PostgreSQL credentials and TLS, PostgreSQL-backed rate limiting, telemetry configuration, backup ownership, and the absence of placeholders, local hosts, or development-only settings. It does not contact external providers or print secret values.

Preview orchestration validates `infra/environments/preview.local.env` through the shared delivery environment parser and its preview allowances. Those allowances are not accepted by the production gate.

See `docs/production-readiness.md` for the complete release-workflow contract.

## Runtime and artifact ownership

Images do not contain production secrets. The deployment platform must inject database credentials, telemetry endpoints, and provider-specific identity configuration at runtime.

The repository release workflow generates image SBOMs, enforces the vulnerability policy, signs published digests, and publishes build-provenance and SBOM attestations. See [Image supply-chain artifacts](image-supply-chain.md). The deployment platform remains responsible for TLS termination, admission enforcement, OCI referrer retention, secret rotation, network policy, managed backups, and environment approval.
