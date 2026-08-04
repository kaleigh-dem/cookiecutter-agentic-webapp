# Releases and preview environments

## Release preparation

The release path has two explicit stages:

1. **Release images** builds, scans, signs, and publishes one immutable set of API, worker, and web images from `main`.
2. **Promote release digests** approves those exact digest references for production and generates the production release plan.

Dispatch **Release images** with a new semantic version and the production-safe public values compiled into the web image. The workflow serializes dispatches for the same semantic version before checking the registry, refuses to overwrite an existing version, records the source workflow run, and uploads `release-images-VERSION` containing:

- `release-manifest.json`;
- `release-images.env`;
- `release-plan.preview.json`.

The manifest records the API, worker, and web `name@sha256` references plus the public web build inputs. Use its source workflow run ID when dispatching **Promote release digests**.

Generate a plan from a downloaded manifest locally with:

```bash
node tools/delivery/release-plan.mjs \
  --environment production \
  --manifest release-manifest.json \
  --image-environment-file release-images.env \
  --output release-plan.production.json
```

The plan is a review artifact. Production plans run `pnpm production:check` before backup capture, migration inspection, or deployment and require a recorded database snapshot before migrations. Migrations run once, from a controlled release runner, before application services are updated. Never run migrations independently from every replica.

The generated `release-images.env` contains only `APP_VERSION` and immutable API, worker, and web digest references. The deployment command sources it after the protected environment configuration so mutable tags cannot replace the approved artifacts.

## Production promotion

Configure a GitHub Environment named `production` with required reviewers and deployment-branch restrictions that allow only `main`. Store the complete production environment contract in that Environment's `PRODUCTION_ENVIRONMENT` secret.

Dispatch **Promote release digests** with:

- the published semantic version;
- the source workflow run ID reported by **Release images**.

Before checkout or production Environment access, a separate guard job rejects any promotion execution not dispatched from `refs/heads/main`. The promotion workflow then requires a successful `Release images` run from `main`, downloads the artifact from that exact run, validates its source SHA and manifest, verifies each Cosign signature and GitHub attestation, and compares the compiled browser values with the protected production configuration.

The production job has only `actions: read`, `attestations: read`, `contents: read`, and `packages: read`. It does not receive package-write, attestation-write, or OIDC-token permissions. It does not build, retag, or push images. Its output is the approved `production-promotion-VERSION` artifact containing the source metadata, immutable manifest, digest environment file, and production release plan.

Image publication is not deployment approval. The environment owner must review the plan, backup identifier, scan evidence, manifest, and digest references before the deployment platform consumes the approved artifact.

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

A hosted preview should use a unique hostname, an isolated database or schema, and short-lived identity configuration for each pull request. For release-candidate validation, deploy the digest references from `release-images.env`; do not rebuild after publication. Run `tools/delivery/smoke-test.mjs` and `tools/delivery/load-test.mjs` against the hosted URLs before requesting production promotion.

Destroy previews when the pull request closes. Deletion must remove compute, credentials, temporary data, DNS records, and telemetry routing. Retain only the logs and measurements required by the team's audit policy.

## Performance budgets

`performance/budgets.json` defines request count, concurrency, timeout, maximum P95 latency, and maximum error rate. A budget change must include the before/after measurement and business rationale. Do not loosen a budget solely to make CI pass.
