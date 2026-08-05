# ADR 0014: Immutable digest promotion

- Status: Accepted
- Date: 2026-08-04

## Context

ADR 0009 established environment-specific release plans, and ADR 0013 established SBOMs, vulnerability policy, keyless signatures, and attestations for published image digests. The remaining release risk is rebuilding or republishing images after preview validation. A second build can change dependencies, labels, timestamps, or tool output even when it uses the same source revision, so a production approval that names only a semantic version does not prove that production receives the artifact reviewed in preview.

The web image also contains public API and browser-authentication values compiled at build time. An immutable promotion path therefore has to record those values with the digests and reject a production configuration that does not match them.

The baseline must remain provider-neutral. GitHub Actions may control approval and evidence, but deployment remains an operator or platform responsibility.

## Decision

1. The **Release images** workflow runs only from `main` and publishes each semantic version once.
   - It refuses to overwrite an API, worker, or web version tag that already exists.
   - It builds, scans, signs, and attests the images before recording their registry digests.
2. The workflow creates a versioned release manifest containing:
   - the semantic version;
   - the source repository, workflow, run ID, commit SHA, ref, and preview environment;
   - the public web build inputs;
   - the API, worker, and web image names, digests, and exact `name@sha256` references.
3. Preview and production release plans generated from that manifest use only digest references. They source a generated `release-images.env` after the environment configuration so mutable image tags cannot override the approved digests.
4. The **Promote release digests** workflow accepts a version and source workflow run ID.
   - It requires a successful `Release images` run from `main`.
   - It downloads the immutable artifact from that exact run and validates the manifest against the run metadata.
   - It verifies Cosign signatures, build provenance, and SPDX SBOM attestations for all three digest references.
   - It compares the protected production configuration with the public values compiled into the web image.
   - It generates and retains an approved production release plan without rebuilding, retagging, or pushing an image.
5. The promotion job targets the `production` GitHub Environment. Repository administrators must configure required reviewers and deployment-branch restrictions for that environment.
6. Production promotion has read-only repository, workflow-artifact, package, and attestation permissions. It receives no package-write, attestation-write, or OIDC-token permission.
7. Rollback selects a previously approved release manifest and its exact digests. Mutable rollback tags are not part of the immutable promotion contract.

## Consequences

- Production can consume the exact image bytes validated and published by the preview release stage.
- Re-running a semantic version fails instead of replacing an existing release artifact.
- Promotion approval is auditable through the GitHub Environment, source workflow run, manifest, verification output, and production plan.
- Public web build inputs must match the protected production configuration; environment-specific differences require a new release version and new digest manifest.
- The deployment platform must consume `release-images.env` or equivalent digest references from the approved promotion artifact.
- Workflow artifacts are retained for 90 days by default in this repository. Long-term release-record retention remains P13-06.
