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

The plan is a review artifact. Production plans run `pnpm production:check` before backup capture, migration inspection, or deployment and require a recorded database snapshot before migrations. Migrations run once, from a controlled release runner, before application services are updated. Never run migrations independently from every replica.

The **Release images** workflow accepts a semantic version, target environment, and public API URL. Production runs consume the masked `PRODUCTION_ENVIRONMENT` contract, compare its public web values with the image build inputs, generate the plan, build all three versioned images, create an SPDX SBOM and vulnerability report for each image, and enforce the repository-owned severity and exception policy before publication. When image publication is enabled, the workflow pushes each validated image once, resolves its immutable digest, signs the digest, and publishes build-provenance and SBOM attestations. See [Image supply-chain artifacts](image-supply-chain.md) for the policy and verification commands.

Image publication is not deployment approval. The environment owner must review the plan, backup identifier, scan evidence, and published digest references before applying it. Digest promotion between environments remains a separate release decision.

## Preview validation

Run the local production-artifact preview:

```bash
pnpm preview:up
pnpm preview:smoke
pnpm performance:load
pnpm preview:down
```

`preview:up` performs the following sequence:

1. Validate `infra/environments/preview.local.env`.
2. Build the API, worker, and web images.
3. Start PostgreSQL and wait for health.
4. Apply pending migrations through the host-facing database URL.
5. Start the application services and wait for health.
6. Run the configured smoke profile.

The repository-local preview selects `live-agent-task`, which checks worker operations and proves a created Agent Task reaches terminal success. Generic generated preview and release plans select the `release` smoke profile, which does not require a development credential or internal worker URL. See `docs/reference-feature-agent-tasks.md` for the profile boundary.

The Delivery workflow runs the preview lifecycle for relevant pull requests and enforces `performance/budgets.json`.

## Hosted previews

A hosted preview should use a unique hostname, an isolated database or schema, and short-lived identity configuration for each pull request. Build the same immutable images used by release automation; do not rebuild after approval. Run `tools/delivery/smoke-test.mjs` and `tools/delivery/load-test.mjs` against the hosted URLs before exposing the preview to reviewers.

Destroy previews when the pull request closes. Deletion must remove compute, credentials, temporary data, DNS records, and telemetry routing. Retain only the logs and measurements required by the team's audit policy.

## Performance budgets

`performance/budgets.json` defines request count, concurrency, timeout, maximum P95 latency, and maximum error rate. A budget change must include the before/after measurement and business rationale. Do not loosen a budget solely to make CI pass.
