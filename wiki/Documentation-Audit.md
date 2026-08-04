# Documentation Audit

This page records the audit scope, information architecture, coverage matrix, verified command additions, discrepancies, and unresolved topics behind the wiki update.

## Audit status

- Merged PR #50 added image SBOMs, Trivy scanning, a fail-closed HIGH/CRITICAL policy, expiring exact exceptions, Cosign keyless signatures, GitHub build provenance, SPDX attestations, and `pnpm supply-chain:check`.
- Open PR #52 introduces immutable one-time publication, release manifests, digest promotion, protected `preview` and `production` environments, `pnpm release:manifest:check`, read-only production approval, and immutable rollback.
- This wiki change is stacked on PR #52's exact implementation branch. It must be merged with, or after, that implementation; otherwise the promotion commands and workflows are not present on `main`.

## Audit limitation

The connected GitHub repository API cannot retrieve or update the hidden `.wiki.git` repository and GitHub wikis do not expose the repository's normal pull-request workflow through this interface. The PR therefore contains the reviewed wiki files under `wiki/`. After review, apply them over the existing wiki checkout using `wiki/README.md`.

## Updated information architecture

1. Home
2. Quick Start
3. Choosing Workspace Profiles
4. Repository Tour
5. Everyday Development
6. Code Generation
7. Architecture
8. Authentication and Authorization
9. Database and Data Management
10. Worker and Background Jobs
11. Validation and Testing
12. Containers and Preview Environments
13. Repository and GitHub Setup
14. Image Supply Chain
15. Production Readiness
16. Releases and Upgrades
17. Troubleshooting
18. Documentation Audit
19. Sidebar and footer navigation

## Coverage matrix

| Requirement | Wiki coverage |
| --- | --- |
| SBOM generation for API, worker, and web | Image Supply Chain |
| Trivy scan evidence | Image Supply Chain |
| HIGH/CRITICAL fail-closed policy | Image Supply Chain, Production Readiness |
| Exact expiring vulnerability exceptions | Image Supply Chain, Production Readiness |
| Cosign keyless signatures | Image Supply Chain |
| Build provenance and SPDX attestations | Image Supply Chain |
| Digest verification | Image Supply Chain |
| `pnpm supply-chain:check` | Image Supply Chain, Validation and Testing |
| Preview and production GitHub Environments | Repository and GitHub Setup, Production Readiness |
| Environment-scoped `PRODUCTION_ENVIRONMENT` | Repository and GitHub Setup, Production Readiness |
| One-time immutable publication | Releases and Upgrades |
| Source run ID and promotion artifact | Releases and Upgrades |
| Read-only production promotion | Repository and GitHub Setup, Releases and Upgrades |
| Release manifest contract | Image Supply Chain, Releases and Upgrades, Validation and Testing |
| `pnpm release:manifest:check` | Releases and Upgrades, Validation and Testing |
| Digest-based production release plan | Releases and Upgrades |
| Immutable rollback | Releases and Upgrades, Production Readiness |
| 30-day and 90-day artifact retention | Image Supply Chain, Repository and GitHub Setup, Production Readiness |

## Verified command additions

Matched to the PR #52 package scripts and implementation:

```text
pnpm supply-chain:check
pnpm release:manifest:check
pnpm delivery:check
pnpm nx test delivery --skip-nx-cache
```

Production release-plan form:

```bash
node tools/delivery/release-plan.mjs \
  --environment production \
  --manifest release-manifest.json \
  --image-environment-file release-images.env \
  --output release-plan.production.json
```

Manifest validation form:

```bash
node tools/delivery/release-manifest.mjs validate \
  --manifest release-manifest.json \
  --expected-version <VERSION> \
  --expected-repository <OWNER/REPOSITORY> \
  --expected-run-id <SOURCE_RUN_ID> \
  --expected-commit-sha <FULL_COMMIT_SHA>
```

## Reconciled stale guidance

The wiki no longer instructs users to:

- select preview or production in one image-build workflow;
- optionally push images;
- rebuild images for production;
- supply `PRODUCTION_ENVIRONMENT` to image publication;
- deploy or roll back through mutable semantic-version tags;
- treat publication as deployment approval.

The documented model is publish once from `main`, retain the source run and release artifact, approve exact digests through the protected production environment, and hand the approved plan to the deployment platform.

## Automated checks versus human decisions

Automated checks validate repository policy, image contents, release identity, protected production values, and evidence. Human or platform ownership is still required for vulnerability risk acceptance, production approval, deployment, migrations, backups, rollback compatibility, incident response, and long-term evidence retention.

## Remaining limitations

### PR #52 is not yet merged

Until PR #52 merges, immutable digest promotion and `pnpm release:manifest:check` are branch behavior, not `main` behavior.

### Long-term evidence retention

The baseline retains supply-chain artifacts for 30 days and promotion artifacts for 90 days. The adopting team must define the evidence store, retention duration, access policy, legal holds, and deletion process until future P13-06 work is implemented.

### Deployment platform

The repository publishes and approves release artifacts but does not implement provider-specific deployment. Needed information includes target platform, workload identity, registry policy, migration runner, ingress, rollout controller, and rollback commands.

### Production admission policy

The repository provides verification commands but cannot document the exact admission controller or policy language until the target platform is chosen.

## Final review result

The updated wiki gives end users a complete path from supply-chain policy through immutable publication, production approval, exact-digest handoff, and rollback, while preserving the boundary that the deployment platform performs the actual deployment.

## Related pages

- [Image Supply Chain](Image-Supply-Chain)
- [Repository and GitHub Setup](Repository-and-GitHub-Setup)
- [Releases and Upgrades](Releases-and-Upgrades)
- [Production Readiness](Production-Readiness)

## Next steps

1. Publish the reviewed files to the wiki repository after the implementation dependency is satisfied.
2. Re-run link checks in the GitHub Wiki UI.

[Back to Home](Home)
