# Image Supply Chain

This page explains the supply-chain evidence created for the API, worker, and web images, the vulnerability gate that runs before publication, and how operators verify an exact published digest.

## Prerequisites

- A generated repository that includes the `Release images` workflow.
- Permission to view workflow runs and download artifacts.
- `cosign` and GitHub CLI (`gh`) for independent signature and attestation verification.
- The semantic version and source workflow run ID for the release being inspected.

## What the release workflow creates

The `Release images` workflow runs from `main` and publishes one immutable image set for each new semantic version. For each API, worker, and web image, it:

1. Refuses to overwrite an existing semantic-version tag.
2. Builds the production image with the reviewed browser build inputs.
3. Generates an SPDX 2.3 JSON software bill of materials (SBOM).
4. Runs Trivy and writes a JSON vulnerability report.
5. Evaluates all three reports against `tools/security/image-scan-policy.json`.
6. Uploads the available SBOM and Trivy files as `image-supply-chain-<VERSION>`, including when the vulnerability policy fails.
7. After the policy passes, pushes each image once and resolves its registry digest.
8. Signs each `name@sha256:...` reference with Cosign keyless signing.
9. Publishes GitHub build-provenance and SPDX SBOM attestations for each digest.
10. Creates the immutable `release-images-<VERSION>` artifact containing the release manifest, digest environment file, and preview release plan.

A failed vulnerability gate prevents publication, signing, attestation, and release-manifest creation. It does not discard the available scan evidence.

## When the gate runs

The image policy runs after all three images are built and scanned but before any image is published. This order prevents a known-unapproved HIGH or CRITICAL finding from reaching the registry through the normal release workflow.

Run the repository-owned policy validation locally:

```bash
pnpm supply-chain:check
```

Expected result: the command exits successfully without modifying files.

> `pnpm supply-chain:check` validates the policy and exception definitions. It does not build or scan images locally. Actual SBOM generation and Trivy scanning run in the image release workflow.

For focused delivery tests:

```bash
pnpm nx test delivery --skip-nx-cache
pnpm delivery:check
```

## Severity and exception policy

The default policy fails on `HIGH` and `CRITICAL` vulnerabilities. An exception must identify exactly one affected service, vulnerability, and package.

```json
{
  "service": "api",
  "vulnerabilityId": "CVE-2026-12345",
  "packageName": "example-package",
  "owner": "security@example.com",
  "reason": "The upstream patch is scheduled for the next maintenance window.",
  "expires": "2026-08-31"
}
```

Rules:

- `service` must be `api`, `worker`, or `web`.
- Wildcards and broad package matches are rejected.
- The service, vulnerability ID, and package tuple must be unique.
- `owner`, `reason`, and a valid expiration date are required.
- Expired exceptions fail.
- An active exception that matches no current scan finding also fails, forcing stale entries to be removed.

Treat an exception as temporary risk acceptance. Record the remediation owner and remove the entry as soon as the finding is resolved.

## Inspect workflow artifacts

1. Open the successful or failed `Release images` workflow run.
2. Download `image-supply-chain-<VERSION>`.
3. Confirm the artifact includes:

```text
api.spdx.json
api.trivy.json
worker.spdx.json
worker.trivy.json
web.spdx.json
web.trivy.json
```

4. Review the Trivy results before approving an exception.
5. For a successful publication, also retain:

```text
release-manifest.json
release-images.env
release-plan.preview.json
```

The supply-chain evidence artifact is retained for 30 days by the baseline workflow. Production promotion evidence is retained for 90 days. Longer-term evidence retention remains an adopting-team responsibility until the future retention work tracked under P13-06 is implemented.

## Release manifest

`release-manifest.json` is the authoritative release identity. It binds:

- semantic version;
- source repository, workflow path, workflow run ID, commit SHA, and Git ref;
- source environment;
- public API URL, browser authentication profile, and session endpoint compiled into the web image;
- exact API, worker, and web names, digests, and `name@sha256` references.

Validate the checked-in example contract:

```bash
pnpm release:manifest:check
```

Validate a downloaded manifest against expected metadata:

```bash
node tools/delivery/release-manifest.mjs validate \
  --manifest release-manifest.json \
  --expected-version <VERSION> \
  --expected-repository <OWNER/REPOSITORY> \
  --expected-run-id <SOURCE_RUN_ID> \
  --expected-commit-sha <FULL_COMMIT_SHA>
```

## Verify a published digest

Set values from `release-manifest.json`:

```bash
REPOSITORY=<OWNER/REPOSITORY>
IMAGE=ghcr.io/<OWNER>/<IMAGE_NAME>
DIGEST=sha256:<PUBLISHED_DIGEST>
REFERENCE="$IMAGE@$DIGEST"
```

### Verify the Cosign signature

```bash
cosign verify "$REFERENCE" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity \
  "https://github.com/$REPOSITORY/.github/workflows/release.yml@refs/heads/main"
```

The certificate identity restriction matters. A valid signature from another repository, workflow, or branch is not the required release identity.

### Verify build provenance

```bash
gh attestation verify "oci://$REFERENCE" --repo "$REPOSITORY"
```

### Verify the SPDX SBOM attestation

```bash
gh attestation verify "oci://$REFERENCE" \
  --repo "$REPOSITORY" \
  --predicate-type https://spdx.dev/Document/v2.3
```

Repeat all three checks for API, worker, and web.

## Troubleshoot failed scans

### HIGH or CRITICAL finding has no exception

1. Download `image-supply-chain-<VERSION>`.
2. Identify the service, vulnerability ID, package, installed version, and fixed version.
3. Prefer upgrading or removing the affected package or base-image layer.
4. Rebuild with a new semantic version; never overwrite the rejected version.
5. Create a narrow expiring exception only after explicit risk review.

### Policy validation reports an expired or unused exception

1. Open `tools/security/image-scan-policy.json`.
2. Remove an exception that no longer matches a current finding.
3. For an expired but still-present risk, obtain a new approval and update the expiration with current rationale.
4. Run:

```bash
pnpm supply-chain:check
pnpm delivery:check
```

### Signature or attestation verification fails

Check that the reference uses the digest from the release manifest, the source run is a successful `Release images` run from `main`, the repository and workflow identity are exact, the registry preserves OCI referrers, and the verifier can read packages and attestations.

Do not work around a verification failure by deploying the tag or disabling admission checks.

## Deployment-platform responsibilities

The repository creates and verifies release evidence; it does not enforce the target platform's deployment policy. The adopting platform must own registry retention, OCI referrer support, admission rules, long-term evidence retention, workload identity, deployment approval, rollout, rollback, incident response, and vulnerability-remediation service levels.

## Related pages

- [Repository and GitHub Setup](Repository-and-GitHub-Setup)
- [Validation and Testing](Validation-and-Testing)
- [Releases and Upgrades](Releases-and-Upgrades)
- [Production Readiness](Production-Readiness)

## Next steps

1. [Releases and Upgrades](Releases-and-Upgrades)
2. [Production Readiness](Production-Readiness)

[Back to Home](Home)
