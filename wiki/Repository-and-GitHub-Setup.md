# Repository and GitHub Setup

This page guides repository administrators through access, branch protection, required checks, GitHub Environments, release permissions, secrets, and evidence retention for a generated workspace.

## Prerequisites

- Repository administrator access.
- Named repository, security, release, and production approvers.
- A generated workspace whose identity and CODEOWNERS have been reviewed.
- A target registry and production deployment platform.

## 1. Verify repository identity and ownership

From the workspace root:

```bash
pnpm template:identity:check
cat workspace.template.json
cat .github/CODEOWNERS
```

Confirm the application identity and profiles are correct, CODEOWNERS references active principals, at least two administrators can recover access, and routine contributors do not have unnecessary administrative permissions.

## 2. Configure the default branch

Use `main` as the protected default branch unless the adopting organization deliberately changes both repository configuration and workflow assumptions.

Configure pull requests before merge, blocked direct and force pushes, required approvals, stale-approval dismissal, CODEOWNERS review, conversation resolution, and minimal auditable bypass permissions.

Required checks should include the blocking CI, Security, Delivery, and Generated workspace jobs. Do not make the non-blocking Node-current compatibility lane a required check.

## 3. Create GitHub Environments

Create environments named exactly:

```text
preview
production
```

The image publication workflow targets `preview`. The digest promotion workflow targets `production`.

### Preview

Use `preview` for the trusted `Release images` job that builds, scans, signs, attests, and publishes each semantic version once. Publication needs job-scoped write permissions for packages, attestations, artifact metadata, and the OIDC token used by Cosign keyless signing.

Publication is not production approval. The preview environment must not grant production deployment credentials merely because an image was published successfully.

### Production

Configure `production` with required reviewers, deployment branch restrictions that allow only `main`, an auditable approval policy, and environment-scoped production secrets.

The `Promote release digests` workflow has read-only repository, package, workflow-artifact, and attestation permissions. It verifies already-published evidence and emits an approved production plan. It does not build, retag, push, or deploy images.

## 4. Store the production environment contract

Create an environment-scoped, masked multiline secret named:

```text
PRODUCTION_ENVIRONMENT
```

Store the complete reviewed production environment file in the `production` environment, not as a repository-level variable and not in source control.

Promotion checks that the protected values match the web image's compiled release inputs:

- `APP_VERSION`;
- `NEXT_PUBLIC_API_BASE_URL`;
- `NEXT_PUBLIC_AUTHENTICATION_PROFILE`;
- `NEXT_PUBLIC_AUTH_SESSION_ENDPOINT`.

Do not commit `infra/environments/production.env`.

## 5. Keep permissions least privilege

| Stage | Environment | Required authority | Must not do |
| --- | --- | --- | --- |
| Release images | `preview` | Build, package write, keyless signing, attestation write | Approve production deployment |
| Promote release digests | `production` | Read workflow run, package, signature, attestation, and production configuration | Rebuild, retag, push, or mutate images |

The read-only production workflow ensures approval cannot silently change the artifact under review. Prefer short-lived workload identity over personal access tokens for deployment.

## 6. Configure evidence retention

The baseline retains:

- `image-supply-chain-<VERSION>` for 30 days;
- `production-promotion-<VERSION>` for 90 days.

The production promotion artifact contains source-run metadata, the release manifest, digest environment file, and production release plan. Copy approved artifacts to an owned evidence store before GitHub retention expires when organizational requirements are longer.

Longer-term automated evidence retention is future P13-06 work.

## 7. Verify the setup

1. Dispatch `Release images` from `main` using a new semantic version and production-safe browser values.
2. Confirm the job targets `preview` and publishes `release-images-<VERSION>`.
3. Record the successful source workflow run ID.
4. Dispatch `Promote release digests` with the version and source run ID.
5. Confirm production approval is required.
6. Verify the promotion output contains the same `name@sha256` references as the release manifest.
7. Confirm no image was rebuilt, retagged, or pushed during promotion.
8. Confirm the deployment platform receives only the approved artifact and exact digests.

## 8. Review ongoing administration

At a defined cadence, review repository and environment administrators, CODEOWNERS, required checks, production reviewers and restrictions, secret age, artifact retention, vulnerability exceptions, release audit trails, and emergency access.

## Related pages

- [Image Supply Chain](Image-Supply-Chain)
- [Production Readiness](Production-Readiness)
- [Releases and Upgrades](Releases-and-Upgrades)

## Next steps

1. [Image Supply Chain](Image-Supply-Chain)
2. [Production Readiness](Production-Readiness)

[Back to Home](Home)
