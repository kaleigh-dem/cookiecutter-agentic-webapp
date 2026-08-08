# Releases and Upgrades

This page explains immutable application-image publication and production promotion, deployment handoff, post-deployment release-record finalization, immutable rollback, template releases, and generated-workspace upgrades.

## Application release prerequisites

- The digest-promotion implementation and its `Release images`, `Promote release digests`, and `Finalize release record` workflows.
- GitHub Environments named `preview` and `production`.
- Production reviewers and a `main`-only deployment restriction on `production`.
- The environment-scoped `PRODUCTION_ENVIRONMENT` secret.
- A new semantic version that has never been published.
- Production-safe browser build inputs.
- A deployment platform that can report the backup/snapshot identity captured before migrations and expose the deployed release for smoke validation.

## Immutable application release model

The release path has two pre-deployment workflow stages plus an explicit post-deployment evidence stage:

1. **Release images** builds, scans, signs, attests, and publishes one immutable set of API, worker, and web images from `main`.
2. **Promote release digests** approves those exact digests for production and creates the production release plan.
3. The adopting platform deploys the approved digests, executes the reviewed migration/rollout plan, and records provider-specific deployment facts.
4. **Finalize release record** binds the approved release and promotion runs to the deployed backup identity, migration evidence, rollback/schema decisions, supply-chain evidence, and deployed smoke results.

The publication workflow refuses to overwrite an existing semantic-version tag. If a partial publication fails, only a rerun of the same workflow run ID may reuse an existing image, and only when version, commit, and the canonical public build-input fingerprint all match. Registry inspection errors fail closed rather than being treated as absent tags. Promotion does not rebuild, retag, or push images, and finalization does not rebuild or redeploy them.

## Publish release images

### 1. Dispatch from `main`

Open **Actions → Release images → Run workflow** and select `main`.

Supply:

```text
version: <NEW_SEMANTIC_VERSION>
api_base_url: <PRODUCTION_SAFE_PUBLIC_API_URL>
authentication_profile: oidc | session | none
auth_session_endpoint: <SAME_ORIGIN_SESSION_ENDPOINT>
```

Example:

```text
version: 1.4.0
api_base_url: https://api.example.com
authentication_profile: oidc
auth_session_endpoint: /auth/session/access-token
```

### 2. Review the release gate

The workflow verifies `main`, refuses version overwrite, builds all images once, generates SBOMs and Trivy reports, enforces the HIGH/CRITICAL policy, publishes images, resolves exact registry digests, signs and attests each digest, and uploads `release-images-<VERSION>`.

See [Image Supply Chain](Image-Supply-Chain) for evidence and verification.

### 3. Retain the release artifact and source run ID

Download or retain:

```text
release-images-<VERSION>/
  release-manifest.json
  release-images.env
  release-plan.preview.json
```

Record the successful `Release images` workflow run ID. Promotion and finalization validate evidence against that exact run.

## Release manifest

`release-manifest.json` is authoritative. It records:

- schema version and semantic application version;
- source environment, repository, workflow, run ID, commit SHA, and Git ref;
- public web build inputs;
- API, worker, and web image names, digests, and exact references.

Validate the checked-in example:

```bash
pnpm release:manifest:check
```

Validate a downloaded manifest:

```bash
node tools/delivery/release-manifest.mjs validate \
  --manifest release-manifest.json \
  --expected-version <VERSION> \
  --expected-repository <OWNER/REPOSITORY> \
  --expected-run-id <SOURCE_RUN_ID> \
  --expected-commit-sha <FULL_COMMIT_SHA>
```

`release-images.env` contains only `APP_VERSION` and immutable image references. Source it after protected environment configuration so a mutable tag or environment override cannot replace the approved images.

## Promote exact digests to production

### 1. Dispatch promotion

Open **Actions → Promote release digests → Run workflow** and provide:

```text
version: <PUBLISHED_VERSION>
source_run_id: <SUCCESSFUL_RELEASE_IMAGES_RUN_ID>
```

### 2. Approve the protected environment

A configured reviewer must approve the `production` GitHub Environment. The job is intentionally read-only.

### 3. Review verification

The workflow verifies that:

- the source run is a successful `Release images` dispatch from `main`;
- the source commit SHA and release manifest agree;
- protected production values match compiled browser inputs;
- every digest has the expected Cosign signature;
- every digest has GitHub build provenance and SPDX SBOM attestations.

### 4. Inspect the production plan

The output `production-promotion-<VERSION>` contains:

```text
release-manifest.json
release-images.env
release-plan.production.json
source-run.json
```

Confirm the production plan uses exactly the same `name@sha256` references as the original manifest.

Generate the plan locally when needed:

```bash
node tools/delivery/release-plan.mjs \
  --environment production \
  --manifest release-manifest.json \
  --image-environment-file release-images.env \
  --output release-plan.production.json
```

### 5. Hand off to the deployment platform

The approved artifact is a deployment input, not a deployment action. The target platform must deploy the exact digests, run the ordered backup/migration/rollout steps, retain provider-specific deployment evidence, and make the deployed environment available for release smoke validation.

Record the successful **Promote release digests** workflow run ID. It is required when finalizing the production release record.

## Finalize a production release record

Run **Finalize release record** after the production deployment has consumed the approved promotion artifact. Dispatch `.github/workflows/release-record.yml` from `main`; the finalization job runs in the protected `production` GitHub Environment.

### Required inputs

Provide:

```text
version: <PUBLISHED_VERSION>
source_run_id: <SUCCESSFUL_RELEASE_IMAGES_RUN_ID>
promotion_run_id: <SUCCESSFUL_PROMOTE_RELEASE_DIGESTS_RUN_ID>
backup_identifier: <PROVIDER_SPECIFIC_SNAPSHOT_OR_BACKUP_ID>
backup_captured_at: <ISO_8601_TIMESTAMP_WITH_TIMEZONE>
rollback_window_minutes: <POSITIVE_INTEGER>
schema_compatibility: backward-compatible | roll-forward-only
schema_decision: <CONCRETE_RATIONALE>
```

The backup identifier must name the snapshot captured for this deployment before migrations, not a backup policy name or placeholder. The schema decision records whether the previous approved application digests are expected to run against the deployed schema during the rollback window:

- `backward-compatible` means application rollback may remain possible, subject to incident-time reconfirmation.
- `roll-forward-only` means the migration makes application rollback unsafe and recovery should use a forward fix unless disaster recovery is explicitly invoked.

### What finalization verifies

The workflow consumes the exact successful release and promotion runs. It validates the immutable release manifest against the named source run, rechecks protected production configuration, downloads the matching promotion and supply-chain artifacts, verifies each image signature plus build-provenance and SPDX attestations, extracts migration-related steps from the approved production plan, and runs the release smoke profile against the deployed environment.

A successful run uploads:

```text
release-record-<VERSION>/
```

The bundle contains:

- `release-record.json` with release/promotion run identities, commit SHA, immutable digests, backup identity, rollback window, schema decision, decision metadata, and smoke status;
- `release-manifest.json`, `release-images.env`, the approved production plan, and release/promotion workflow metadata;
- `migration-plan.production.json` containing the approved backup, migration inspection, and migration application steps;
- API, worker, and web SPDX SBOMs and their Trivy reports from the exact release run;
- per-image Cosign and GitHub attestation verification output for build provenance and SPDX SBOM attestations;
- `smoke-test.json` and `smoke-test.log` from the deployed release.

`release-record.json` stores a SHA-256 hash and byte size for every supporting evidence file except the record itself. Validation therefore fails closed if a recorded attachment is missing or modified, or if backup identity, rollback-window/schema evidence, successful deployed smoke, or digest binding is invalid.

### Validate a downloaded release record locally

From the extracted `release-record-<VERSION>` directory, run:

```bash
node tools/delivery/release-record.mjs validate \
  --record release-record.json \
  --manifest release-manifest.json \
  --base-directory .
```

The repository's deterministic delivery tests also validate the checked-in `infra/release/release-record.example.json` fixture against the example immutable manifest.

### Retention and durable handoff

The GitHub Actions `release-record-<VERSION>` artifact is retained for **90 days**. Treat that as transport and review retention, not the durable system of record. Before expiry, persist the complete bundle in the deployment system of record, release archive, or compliance store according to the service's retention policy.

Keeping only `release-record.json` is insufficient because its attachment hashes bind the complete supporting evidence bundle.

## Quarterly baseline restore exercise

`.github/workflows/disaster-recovery.yml` runs quarterly and can also be dispatched manually. It exercises the repository's baseline PostgreSQL recovery mechanics by migrating and seeding an isolated database, taking a custom-format `pg_dump`, restoring into a separate database, comparing deterministic application-table row counts, validating migration state, rerunning migrations, and retaining restore evidence for 90 days.

This quarterly exercise proves the **repository baseline restore path**. It does **not** replace provider-specific production disaster-recovery drills. Production owners must separately test provider snapshot access, encryption/key recovery, permissions, networking, traffic switching, reconciliation, and the declared RPO/RTO for the real platform.

## Immutable rollback

Rollback means selecting a previously approved release manifest, not recreating an old tag.

1. Select a previously approved `production-promotion-<VERSION>` artifact and, when available, its finalized `release-record-<VERSION>` bundle.
2. Verify source/promotion run identities and the release manifest against the original successful runs.
3. Reverify Cosign signatures and GitHub attestations for all three digests.
4. Reconfirm the recorded schema compatibility decision against the current database schema and incident state.
5. Confirm the required backup identifier and rollback evidence are available.
6. Inspect or regenerate the production release plan.
7. Deploy the exact digest references from its `release-images.env`.
8. Run smoke, readiness, authorization, queue, and performance checks.
9. Observe through the defined rollback window.

> Never recreate, overwrite, or retag an old semantic version. A rebuilt image with the same version is not the previously approved release.

Prefer roll-forward after schema changes unless the previous application is compatible with the current schema and rollback is explicitly approved. Never run `pnpm db:rollback` automatically.

## Evidence retention

Default GitHub handoff retention is bounded:

- image supply-chain evidence: 30 days;
- production-promotion artifact: 90 days;
- finalized production release record: 90 days;
- quarterly restore-exercise evidence: 90 days.

Copy evidence to the organization's durable evidence store before expiry when rollback, audit, incident, or regulatory requirements exceed those windows. The repository now creates and validates the P13-06 release-record bundle, but the adopting organization still owns the durable store, access policy, retention duration, legal holds, and deletion policy.

---

## Template releases and generated-workspace upgrades

Application release promotion and release-record finalization are separate from upgrading the workspace template itself.

### Template release model

Template versions follow semantic versioning and use tags:

```text
template-v<VERSION>
```

Each release includes a workspace-plugin tarball containing the public preset, upgrade binary, migrations, and ownership assets. Generated repositories record the originating release in `workspace.template.json` under `upstream.version`.

### Current SteadyStack identity

PR #61 established the canonical `@steadystack` package scope, `@steadystack/workspace-plugin`, `steadystack-upgrade`, `steadystack-workspace-plugin-<VERSION>.tgz`, and `kaleigh-dem/steady-stack` repository identity.

Use those names for all new workspaces and current upgrade procedures. No end-user identity-transition page is published because there were no released generated users that needed to migrate from the earlier development identity. Maintainer-only historical mapping remains in `docs/steadystack-migration.md`.

### Upgrade ownership classes

| Class             | Behavior                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Template-managed  | Upgrade infrastructure; may be replaced by a verified artifact.                                           |
| Generated-once    | Created when absent or changed through explicit structured edits; customization is not silently replaced. |
| Application-owned | Never overwritten automatically; migration reports manual follow-up.                                      |

The machine-readable policy is `tools/template/ownership.json`.

## Complete template-upgrade walkthrough

### 1. Prepare a dedicated branch

```bash
git status --short
git switch -c chore/template-upgrade-<TARGET_VERSION>
```

Commit or stash unrelated work.

### 2. Download and install the target artifact

Place `steadystack-workspace-plugin-<TARGET_VERSION>.tgz` in a known local path, then:

```bash
TARGET_VERSION=<TARGET_VERSION>
pnpm add --save-dev "./steadystack-workspace-plugin-${TARGET_VERSION}.tgz"
```

### 3. Dry run

```bash
pnpm exec steadystack-upgrade \
  --to "$TARGET_VERSION" \
  --dry-run
```

Review ordered migrations, ownership class, file actions, conflicts, and manual follow-up.

### 4. Resolve conflicts

For application-owned or customized generated-once files:

1. Read target release notes and migration guidance.
2. Decide how product code should adopt the change.
3. Edit manually where required.
4. Rerun dry-run until all conflicts are understood.

### 5. Apply and install

```bash
pnpm exec steadystack-upgrade \
  --to "$TARGET_VERSION" \
  --apply
pnpm install --frozen-lockfile
```

Applied migrations update provenance and synchronize the repository-local runner.

### 6. Validate

```bash
pnpm template:identity:check
pnpm check
pnpm db:status
git status --short
git diff
```

When database or delivery behavior changes, also run the relevant migration, preview, smoke, performance, supply-chain, release-manifest, and release-record checks.

### 7. Commit separately

```bash
git add -A
git commit -m "chore: upgrade workspace template to $TARGET_VERSION"
```

Do not mix product features with the template upgrade.

## Recovery after an unsuccessful template upgrade

A dry run does not write files. After an apply but before commit, inspect the diff. Only when every uncommitted file is disposable:

```bash
git reset --hard HEAD
git clean -fd
pnpm install --frozen-lockfile
```

> **Destructive:** These commands discard uncommitted tracked and untracked files. Back up or commit work first.

After commit, revert the dedicated upgrade commit or create a corrective migration. Source rollback does not automatically reverse database changes.

## Related pages

- [Image Supply Chain](Image-Supply-Chain)
- [Repository and GitHub Setup](Repository-and-GitHub-Setup)
- [Production Readiness](Production-Readiness)
- [Validation and Testing](Validation-and-Testing)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [Production Readiness](Production-Readiness)
2. [Troubleshooting](Troubleshooting)

[Back to Home](Home)
