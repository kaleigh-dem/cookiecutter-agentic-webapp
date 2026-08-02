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

Override tags and image metadata through `API_IMAGE`, `WORKER_IMAGE`, `WEB_IMAGE`, `APP_VERSION`, and `GITHUB_SHA`. Set `NEXT_PUBLIC_API_BASE_URL` before building the web image because browser-visible values are compiled into the bundle.

API and worker images use `infra/docker/Dockerfile.node-service`. The builder compiles the workspace, stages compiled workspace packages, and runs `pnpm deploy --prod --legacy` to prune development dependencies. The runtime image contains only the deployed service graph and runs as the unprivileged `node` user.

The web image uses `infra/docker/Dockerfile.web` and Next.js standalone output. It also runs as the unprivileged `node` user.

## Validate configuration

Checked-in examples live under `infra/environments`:

- `preview.env.example`
- `production.env.example`
- `preview.local.env` for CI and local image validation

Copy the appropriate example to an untracked `.env` file, replace every placeholder through the deployment platform's secret/configuration system, and validate it:

```bash
node tools/delivery/validate-environment.mjs infra/environments/production.env
```

Validation requires semantic application versions, a PostgreSQL URL, positive numeric limits, production runtime mode outside development, and HTTPS public endpoints. Production configuration rejects the development access token.

`--allow-placeholders` exists only to validate the shape of checked-in examples. `--allow-local` exists only for loopback preview validation. Neither option belongs in a real production release.

## Runtime ownership

Images do not contain production secrets. The deployment platform must inject database credentials, telemetry endpoints, and provider-specific identity configuration at runtime. TLS termination, image signing/attestation, secret rotation, and network policy remain platform responsibilities.
