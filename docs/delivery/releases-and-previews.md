# Releases and preview environments

## Release preparation

Use immutable semantic versions and generate the ordered release plan before changing an environment:

```bash
node tools/delivery/release-plan.mjs \
  --environment production \
  --image-prefix ghcr.io/OWNER/agentic-webapp \
  --version 1.2.3 \
  --output release-plan.json
```

The plan is a review artifact. It requires configuration validation and a recorded database snapshot before migrations. Migrations run once, from a controlled release runner, before application services are updated. Never run migrations independently from every replica.

The **Release images** workflow accepts a semantic version, target environment, and public API URL. It generates the plan, builds all three versioned images, and can push them to GHCR. Image publication is not deployment approval; the environment owner must review the plan and backup identifier before applying it.

## Preview validation

Run the local production-artifact preview:

```bash
pnpm preview:up
pnpm performance:load
pnpm preview:down
```

`preview:up` performs the following sequence:

1. Validate `infra/environments/preview.local.env`.
2. Build the API, worker, and web images.
3. Start PostgreSQL and wait for health.
4. Apply pending migrations through the host-facing database URL.
5. Start the application services and wait for health.
6. Verify web, API liveness/readiness, and the protected metrics boundary.

The Delivery workflow runs this sequence for relevant pull requests and then enforces `performance/budgets.json`.

## Hosted previews

A hosted preview should use a unique hostname, an isolated database or schema, and short-lived identity configuration for each pull request. Build the same immutable images used by release automation; do not rebuild after approval. Run `tools/delivery/smoke-test.mjs` and `tools/delivery/load-test.mjs` against the hosted URLs before exposing the preview to reviewers.

Destroy previews when the pull request closes. Deletion must remove compute, credentials, temporary data, DNS records, and telemetry routing. Retain only the logs and measurements required by the team's audit policy.

## Performance budgets

`performance/budgets.json` defines request count, concurrency, timeout, maximum P95 latency, and maximum error rate. A budget change must include the before/after measurement and business rationale. Do not loosen a budget solely to make CI pass.
