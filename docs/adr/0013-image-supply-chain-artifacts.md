# ADR 0013: Image supply-chain artifacts

- Status: Accepted
- Date: 2026-08-03

## Context

ADR 0009 established production OCI images and a provider-neutral release workflow, but it left image signing and attestation to each deployment platform. That gap makes it difficult for generated repositories to prove what an image contains, which workflow built it, whether known vulnerabilities were accepted deliberately, and whether a deployed digest is the artifact that passed the release gate.

The baseline must remain portable. It should use standard OCI registry attachments and GitHub's workload identity rather than long-lived signing keys or a hosting-provider-specific deployment service.

## Decision

1. Generate an SPDX 2.3 JSON software bill of materials for each API, worker, and web production image immediately after the image build.
2. Scan every built image with Trivy and evaluate the JSON reports through the repository-owned policy in `tools/security/image-scan-policy.json`.
   - High and critical vulnerabilities fail the release by default.
   - An exception must match one service, vulnerability identifier, and package exactly.
   - Every exception records an owner, rationale, and expiration date.
   - Expired, duplicate, broad, and unused exceptions fail validation.
3. Upload the SBOM and scan reports as one versioned workflow artifact even when policy evaluation fails, so release failures retain review evidence.
4. When publication is requested, push each validated image once, resolve its registry digest, and use that exact digest for all remaining supply-chain operations.
5. Sign each published digest with Cosign keyless signing backed by the GitHub Actions OIDC identity. Do not store a repository signing key.
6. Generate GitHub build-provenance and SBOM attestations for each published digest and push the attestations to the OCI registry.
7. Document verification of the Cosign certificate identity, GitHub build provenance, and SPDX SBOM attestation. Deployment admission and promotion may require these checks without changing the image.

## Consequences

- A release fails before publication when the image policy finds an unaccepted high or critical vulnerability.
- Publishing requires `packages: write`, `id-token: write`, `attestations: write`, and `artifact-metadata: write` permissions in the release workflow.
- The registry must preserve OCI referrers used for signatures and attestations.
- Generated repositories inherit a concrete signing and verification path without inheriting long-lived credentials.
- Immutable promotion of these digests is governed by ADR 0014; this decision establishes the evidence and identity that promotion must preserve.
