# Repository and GitHub Setup

This page guides repository administrators through human and agent access, branch protection, required checks, GitHub Environments, release permissions, secrets, and evidence retention for a generated workspace.

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

Confirm:

- the application slug, display name, package scope, repository owner, applications, ports, profiles, and upstream version are correct;
- CODEOWNERS references active users or teams with repository access;
- at least two administrators can recover repository and release access;
- routine contributors do not have unnecessary administrative permissions.

## Configure agent access safely

When coding agents receive repository access:

1. Use the minimum repository permission required for the task.
2. Prefer short-lived user or workload credentials over personal access tokens.
3. Do not expose production secrets, database credentials, or cloud administrator roles to ordinary coding sessions.
4. Keep production approval behind the protected `production` Environment and named human reviewers.
5. Treat automation bypass rules as exceptional, explicit, and auditable.
6. Require pull-request review and the same blocking checks for agent-authored and human-authored changes.
7. Preserve root and nested `AGENTS.md`, `.mcp.json`, project tags, and validation commands when customizing the repository.

Agent speed does not change the repository's approval or least-privilege requirements. See [Agentic Development Model](Agentic-Development-Model).

## 2. Configure the default branch

Use `main` as the protected default branch unless the adopting organization deliberately changes both repository configuration and workflow assumptions.

Configure:

- pull requests required before merge;
- direct pushes and force pushes blocked;
- required approvals and stale-approval dismissal;
- CODEOWNERS review for owned paths;
- conversation resolution before merge;
- minimal, auditable bypass permissions.

Required checks should include the blocking CI, Security, Delivery, and Generated workspace jobs produced by the repository. Do not make the non-blocking Node-current compatibility lane a required check.

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

Configure `production` with:

- required reviewers;
- deployment branch restrictions that allow only `main`;
- an auditable approval policy;
- environment-scoped secrets and variables limited to production promotion.

The `Promote release digests` workflow has read-only repository, package, workflow-artifact, and attestation permissions. It verifies already-published evidence and emits an approved production plan. It does not build, retag, push, or deploy images.

## 4. Store the production environment contract

Create an environment-scoped, masked multiline secret named:

```text
PRODUCTION_ENVIRONMENT
```

Store the complete reviewed production environment file in the `production` environment, not as a repository-level variable and not in the source tree.

The promotion workflow materializes it in a permission-restricted temporary file and checks that the protected values match the web image's compiled release inputs:

- `APP_VERSION`;
- `NEXT_PUBLIC_API_BASE_URL`;
- `NEXT_PUBLIC_AUTHENTICATION_PROFILE`;
- `NEXT_PUBLIC_AUTH_SESSION_ENDPOINT`.

Do not commit `infra/environments/production.env`.

## 5. Keep permissions least privilege

The two-stage release model separates authority:

| Stage | Environment | Required authority | Must not do |
| --- | --- | --- | --- |
| Release images | `preview` | Build, package write, keyless signing, attestation write | Approve production deployment |
| Promote release digests | `production` | Read workflow run, package, signature, attestation, and production configuration | Rebuild, retag, push, or mutate images |

The read-only production workflow ensures approval cannot silently change the artifact under review.

Prefer cloud workload identity or another short-lived federated credential for the deployment platform. Do not use long-lived personal access tokens for routine releases.

## 6. Configure evidence retention

The baseline retains:

- `image-supply-chain-<VERSION>` for 30 days;
- `production-promotion-<VERSION>` for 90 days.

The production promotion artifact contains the source-run metadata, release manifest, digest environment file, and production release plan. Preserve it according to the organization's audit, incident, rollback, and regulatory requirements.

Longer-term automated evidence retention is not yet implemented by the template and remains future P13-06 work. Until then, copy approved artifacts to an owned evidence store before GitHub retention expires.

## 7. Verify the setup

Before the first release:

1. Dispatch `Release images` from `main` using a new semantic version and production-safe public browser values.
2. Confirm the job targets `preview` and publishes `release-images-<VERSION>`.
3. Record the successful source workflow run ID.
4. Dispatch `Promote release digests` with the version and source run ID.
5. Confirm production approval is required.
6. Verify the promotion output contains the same `name@sha256` references as the release manifest.
7. Confirm no image was rebuilt, retagged, or pushed during promotion.
8. Confirm the deployment platform receives only the approved artifact and exact digest references.

## 8. Review ongoing administration

At a defined cadence, review:

- active repository and environment administrators;
- CODEOWNERS validity;
- required checks and workflow names;
- production reviewers and branch restrictions;
- secret age and rotation evidence;
- artifact-retention coverage;
- vulnerability exceptions and expiration;
- release and deployment audit trails;
- emergency access and recovery procedures.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Image Supply Chain](Image-Supply-Chain)
- [Production Readiness](Production-Readiness)
- [Releases and Upgrades](Releases-and-Upgrades)

## Next steps

1. [Image Supply Chain](Image-Supply-Chain)
2. [Production Readiness](Production-Readiness)

[Back to Home](Home)
