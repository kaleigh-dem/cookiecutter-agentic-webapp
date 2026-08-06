# Releases and Upgrades

This page explains immutable application-image publication and production promotion, release manifests, deployment handoff, immutable rollback, template releases, and generated-workspace upgrades.

## Application release prerequisites

- The digest-promotion implementation and its `Release images` and `Promote release digests` workflows.
- GitHub Environments named `preview` and `production`.
- Production reviewers and a `main`-only deployment restriction on `production`.
- The environment-scoped `PRODUCTION_ENVIRONMENT` secret.
- A new semantic version that has never been published.
- Production-safe browser build inputs.

## Immutable application release model

The release path has two explicit stages:

1. **Release images** builds, scans, signs, attests, and publishes one immutable set of API, worker, and web images from `main`.
2. **Promote release digests** approves those exact digests for production and creates the production release plan.

The publication workflow refuses to overwrite an existing semantic-version tag. If a partial publication fails, only a rerun of the same workflow run ID may reuse an existing image, and only when version, commit, and the canonical public build-input fingerprint all match. Registry inspection errors fail closed rather than being treated as absent tags. Promotion does not rebuild, retag, or push images.

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

Record the successful `Release images` workflow run ID. Promotion validates and downloads the artifact from that exact run.

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

The approved artifact is a deployment input, not a deployment action. The target platform must deploy the exact digests, run the ordered migration and rollout steps, and retain its own deployment evidence.

## Immutable rollback

Rollback means selecting a previously approved release manifest, not recreating an old tag.

1. Select a previously approved `production-promotion-<VERSION>` artifact.
2. Verify `source-run.json` and the release manifest against the original successful run.
3. Reverify Cosign signatures and GitHub attestations for all three digests.
4. Confirm the previous application version remains compatible with the current database schema.
5. Inspect or regenerate its production release plan.
6. Deploy the exact digest references from its `release-images.env`.
7. Run smoke, readiness, authorization, queue, and performance checks.
8. Observe through the defined rollback window.

> Never recreate, overwrite, or retag an old semantic version. A rebuilt image with the same version is not the previously approved release.

Prefer roll-forward after schema changes unless the previous application is compatible with the current schema and rollback is explicitly approved. Never run `pnpm db:rollback` automatically.

## Evidence retention

The baseline promotion artifact is retained for 90 days. Preserve approved manifests and plans in the organization's evidence store before expiration when rollback, audit, or regulatory requirements exceed that window. Longer-term retention automation remains future P13-06 work.

---

## Template releases and generated-workspace upgrades

Application release promotion is separate from upgrading the workspace template itself.

### Template release model

Template versions follow semantic versioning and use tags:

```text
template-v<VERSION>
```

Each release includes a workspace-plugin tarball containing the public preset, upgrade binary, migrations, and ownership assets. Generated repositories record the originating release in `workspace.template.json` under `upstream.version`.

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

When database or delivery behavior changes, also run the relevant migration, preview, smoke, performance, supply-chain, and release-manifest checks.

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
