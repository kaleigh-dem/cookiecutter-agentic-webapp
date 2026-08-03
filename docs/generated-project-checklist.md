# Generated project checklist

Use this checklist after initialization and before the repository is opened to a team or connected to a production environment. Record owners and links in the generated repository rather than treating the checklist as a one-time informal review.

## Repository identity and access

- [ ] Repository name, description, visibility, topics, and default branch match the application and organization policy.
- [ ] `workspace.template.json` contains the intended application identity, repository owner, applications, ports, database name, profiles, and originating template version.
- [ ] `.github/CODEOWNERS` names active users or teams with access to the repository.
- [ ] Administrative, maintain, write, triage, and read permissions follow least privilege.
- [ ] At least two maintainers can recover repository administration and release access.
- [ ] Merge strategy, automatic branch deletion, commit-signing policy, and repository retention settings are documented.

## Branch protection and required checks

- [ ] Direct pushes and force pushes to the default branch are blocked.
- [ ] Pull requests are required before merging.
- [ ] Required approvals and stale-approval dismissal match the team's risk level.
- [ ] CODEOWNERS review is required for owned paths.
- [ ] Required checks include the blocking CI, Security, and Delivery jobs currently produced by the repository.
- [ ] The non-blocking current-Node compatibility lane is not accidentally configured as a required check.
- [ ] Conversations must be resolved before merge.
- [ ] Administrators and automation bypass rules are explicit and minimal.

## Environments and release permissions

- [ ] Preview and production GitHub Environments exist when those deployment stages are used.
- [ ] Production has required reviewers, branch or tag restrictions, and an auditable approval policy.
- [ ] Environment-scoped variables identify domains, image registries, deployment targets, and non-secret configuration.
- [ ] Environment-scoped secrets use the minimum permissions and are not duplicated as repository variables.
- [ ] `GITHUB_TOKEN` permissions in workflows remain least privilege; long-lived personal tokens are not used for routine releases.
- [ ] Cloud or platform deployments use short-lived workload identity or an equivalent federated credential when available.
- [ ] Release tags, package publication, image publication, and deployment permissions have named owners.

## Secrets and application configuration

- [ ] `.env` and other local secret files remain ignored and untracked.
- [ ] Development authentication tokens and subjects are not present in production configuration.
- [ ] Database and any implemented external-service credentials are unique per environment and use TLS where supported.
- [ ] OIDC issuer, audience, client, key-rotation, session, or token-renewal settings are owned and tested for the selected authentication profile.
- [ ] OIDC discovery and JWKS endpoints are HTTPS, reachable from API replicas, and exercised for rotation and outage behavior.
- [ ] Public browser variables are reviewed as non-secret values and point to the correct HTTPS endpoints.
- [ ] CORS origins, trusted proxies, callback URLs, and cookie domains match the deployed topology.
- [ ] Distributed rate-limit thresholds, tenant claim mapping, PostgreSQL capacity, and trusted ingress hop count are validated under representative multi-replica traffic.
- [ ] Telemetry credentials, endpoints, sampling, redaction, and retention are configured for each environment.
- [ ] Secret rotation and identity-provider outage procedures are documented.

## Ownership and operations

- [ ] Product, engineering, security, data, infrastructure, and incident-response owners are named.
- [ ] Database migration approval, backup, restore testing, retention, and data-repair ownership are assigned.
- [ ] Selected worker transport has an owner for queue or outbox capacity, retries, dead letters, replay, and shutdown behavior.
- [ ] Rate-limit `429` policy responses and fail-closed `503 rate_limit_unavailable` responses have dashboards, alerts, and an incident owner.
- [ ] Dashboards, alerts, service-level objectives, escalation paths, and log access are defined.
- [ ] Domains, DNS, certificates, ingress, image registry, scaling, and deployment rollback are owned.
- [ ] Dependency updates, template upgrades, vulnerability exceptions, and license exceptions have review cadences.

## Validation before shared development

- [ ] The generated repository has no unintended upstream identity: `pnpm template:identity:check` passes.
- [ ] A frozen install succeeds from a clean checkout: `pnpm install --frozen-lockfile`.
- [ ] The full repository contract passes: `pnpm check`.
- [ ] Database migrations and seeds run against disposable local infrastructure.
- [ ] The selected applications start locally and their primary user flow is exercised.
- [ ] The Git working tree is clean after validation.

## Validation before deployment

- [ ] Every production replacement point in `docs/getting-started.md` has an implementation, an owner, or an explicit accepted deferral.
- [ ] Production images build once from reviewed source.
- [ ] `pnpm preview:up`, `pnpm preview:smoke`, and `pnpm performance:load` pass, followed by deterministic `pnpm preview:down`.
- [ ] The release plan records the target environment, version, images, migrations, and smoke checks.
- [ ] Backup and restore evidence is current before migrations that require it.
- [ ] Rollback and disaster-recovery runbooks match the deployment platform and have been exercised by the responsible team.
- [ ] Development-only authentication, local URLs, placeholder secrets, sample identities, and unsupported runtime versions are absent from production configuration.

## Ongoing template maintenance

- [ ] Template provenance remains in `workspace.template.json`.
- [ ] The repository-local `pnpm template:upgrade` command is retained.
- [ ] Template upgrades are previewed with `--dry-run`, applied separately from application changes, and followed by `pnpm check`.
- [ ] Upgrade conflicts are resolved according to the template-managed, generated-once, and application-owned file policy.
- [ ] Release notes and migration guidance are reviewed before adopting a new template version.
