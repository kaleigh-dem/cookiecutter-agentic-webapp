# Image supply-chain artifacts

The **Release images** workflow creates supply-chain evidence for the API, worker, and web production images before it publishes them.

## Release gate

For each image, the workflow:

1. validates that the workflow was dispatched from `main` and that the semantic version has not already been published;
2. builds the versioned production image;
3. generates an SPDX 2.3 JSON SBOM;
4. generates a Trivy JSON vulnerability report;
5. evaluates all three reports against `tools/security/image-scan-policy.json`;
6. uploads the six files as the `image-supply-chain-VERSION` workflow artifact;
7. pushes the validated images, resolves their registry digests, signs those digests, and publishes build-provenance and SBOM attestations;
8. writes `release-manifest.json`, `release-images.env`, and `release-plan.preview.json` to the immutable `release-images-VERSION` artifact.

The supply-chain artifact upload uses `if: always()`, so a failed policy gate still retains the available SBOMs and scan reports for diagnosis. A failed gate prevents image publication, signing, attestation, and manifest creation.

The workflow refuses to overwrite any existing API, worker, or web version tag. Use a new semantic version when source, dependencies, labels, or public web build inputs change.

## Vulnerability policy

The default policy fails on `HIGH` and `CRITICAL` findings. Validate the policy locally with:

```bash
pnpm supply-chain:check
```

An exception is permitted only when all of these fields are present:

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

`service` must be `api`, `worker`, or `web`. Wildcards are not supported. The tuple of service, vulnerability ID, and package name must be unique. Expired exceptions fail, and an active exception that does not match a current report also fails so stale policy entries are removed.

Review an exception as a temporary risk acceptance. The owner must track the remediation and remove the entry when the finding disappears.

## Published identity

Publication uses the registry digest returned after `docker push`. The workflow never signs or attests a mutable tag. Cosign obtains a short-lived signing certificate from the GitHub Actions OIDC identity, and GitHub publishes both build provenance and the SPDX SBOM attestation for the same digest.

`release-manifest.json` is the authoritative link between:

- the semantic version;
- the source repository, workflow run ID, commit SHA, ref, and preview environment;
- the public browser values compiled into the web image;
- the three exact image digest references.

Validate a downloaded manifest with:

```bash
pnpm release:manifest:check

node tools/delivery/release-manifest.mjs validate \
  --manifest release-manifest.json \
  --expected-version 1.2.3 \
  --expected-repository OWNER/REPOSITORY \
  --expected-run-id SOURCE_RUN_ID
```

## Verify a published image

Set the repository, image name, and digest from the release manifest:

```bash
REPOSITORY=OWNER/REPOSITORY
IMAGE=ghcr.io/OWNER/steadystack-api
DIGEST=sha256:REPLACE_WITH_PUBLISHED_DIGEST
REFERENCE="$IMAGE@$DIGEST"
```

Verify the keyless signature and restrict it to this repository's release workflow on `main`:

```bash
cosign verify "$REFERENCE" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity \
  "https://github.com/$REPOSITORY/.github/workflows/release.yml@refs/heads/main"
```

Verify GitHub build provenance:

```bash
gh attestation verify "oci://$REFERENCE" --repo "$REPOSITORY"
```

Verify that an SPDX 2.3 SBOM attestation is present:

```bash
gh attestation verify "oci://$REFERENCE" \
  --repo "$REPOSITORY" \
  --predicate-type https://spdx.dev/Document/v2.3
```

Verification must use the expected repository and workflow identity. A valid signature from a different repository or workflow is not sufficient.

## Promote to production

The **Promote release digests** workflow consumes the `release-images-VERSION` artifact from one successful **Release images** run on `main`. It validates the manifest against that run, verifies all signatures and attestations, and confirms that the protected production configuration matches the web image's compiled public values.

The job targets the `production` GitHub Environment. Configure required reviewers and allow deployments only from `main`. Promotion has read-only permissions and does not build, retag, or push an image. The approved `production-promotion-VERSION` artifact is the handoff to the deployment platform.

Rollback selects a previously approved release manifest and digest environment file rather than a mutable rollback tag.

## Deterministic checks

The delivery test suite covers policy normalization, severity enforcement, exact exceptions, expiration, stale exceptions, manifest validation, digest release planning, and promotion-workflow wiring:

```bash
pnpm nx test delivery --skip-nx-cache
pnpm delivery:check
```
