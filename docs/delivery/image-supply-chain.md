# Image supply-chain artifacts

The **Release images** workflow creates supply-chain evidence for the API, worker, and web production images before it publishes them.

## Release gate

For each image, the workflow:

1. builds the versioned production image;
2. generates an SPDX 2.3 JSON SBOM;
3. generates a Trivy JSON vulnerability report;
4. evaluates all three reports against `tools/security/image-scan-policy.json`;
5. uploads the six files as the `image-supply-chain-VERSION` workflow artifact;
6. when `push_images` is enabled, pushes the validated images, resolves their registry digests, signs those digests, and publishes build-provenance and SBOM attestations.

The artifact upload uses `if: always()`, so a failed policy gate still retains the available SBOMs and scan reports for diagnosis. A failed gate prevents image publication, signing, and attestation.

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

Record the three digest references from the workflow summary before deployment or promotion.

## Verify a published image

Set the repository, image name, and digest from the workflow summary:

```bash
REPOSITORY=OWNER/REPOSITORY
IMAGE=ghcr.io/OWNER/agentic-webapp-api
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

## Deterministic checks

The delivery test suite covers policy normalization, severity enforcement, exact exceptions, expiration, stale exceptions, and release-workflow wiring:

```bash
pnpm nx test delivery --skip-nx-cache
pnpm delivery:check
```
