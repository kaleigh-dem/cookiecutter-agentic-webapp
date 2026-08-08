# Production Readiness

This page is a practical launch checklist. It distinguishes automated repository checks from human, organizational, release-evidence, and platform decisions.

## Prerequisites

- A generated repository with intended profiles recorded.
- Named product, engineering, security, data, infrastructure, release, and incident owners.
- A target production platform and identity provider.
- GitHub Environments and immutable release promotion configured.

## Core warning

Passing local development, `pnpm check`, preview smoke, image publication, digest promotion, or release-record finalization does not make the service production-ready. Automation validates code, configuration, image evidence, release identity, and recorded deployment evidence; it cannot assign ownership, approve business risk, create provider integrations, prove a real provider restore, or operate an incident.

## Agent boundary

AI agents may prepare configuration, tests, release evidence, checklists, migration plans, and rollback procedures. Accountable humans must approve architecture exceptions, production access, vulnerability risk acceptance, destructive data operations, environment promotion, deployment, rollback, and incident decisions. Do not bypass protected environments or give an agent long-lived production credentials to increase autonomy.

## Automated repository checks

Run:

```bash
pnpm install --frozen-lockfile
pnpm template:identity:check
pnpm check
pnpm supply-chain:check
pnpm release:manifest:check
pnpm production:check -- <EXACT_PRODUCTION_ENVIRONMENT_FILE>
pnpm preview:up
pnpm performance:load
pnpm preview:down
git status --short
```

The production gate verifies production-safe identity, endpoints, PostgreSQL TLS, distributed rate limiting, telemetry versioning, backup ownership, and absence of local or placeholder values. It does not contact external services.

The supply-chain and release-manifest commands validate repository policy and the checked-in manifest contract. Actual image scans, signatures, attestations, digest identity, deployed smoke evidence, and finalized release-record binding are verified in release workflows.

## Repository access and governance

- [ ] Repository identity, visibility, description, topics, and default branch are correct.
- [ ] `workspace.template.json` records intended choices and provenance.
- [ ] CODEOWNERS names active users or teams with access.
- [ ] Least-privilege repository roles are configured.
- [ ] At least two maintainers can recover administration and release access.
- [ ] Merge strategy, branch deletion, signing policy, and evidence retention are documented.

See [Repository and GitHub Setup](Repository-and-GitHub-Setup) for the complete administrator procedure.

## Branch protection and required checks

- [ ] Pull requests are required.
- [ ] Direct and force pushes are blocked.
- [ ] Approval count and stale-review dismissal match risk.
- [ ] CODEOWNERS review is required where appropriate.
- [ ] Blocking CI, Security, Delivery, and Generated workspace checks are required.
- [ ] The non-blocking Node-current compatibility lane is not accidentally required.
- [ ] Conversations are resolved before merge.
- [ ] Bypass rules are minimal and auditable.

## GitHub Environments and release permissions

- [ ] Environments named exactly `preview` and `production` exist.
- [ ] `Release images` publishes from `main` through `preview`.
- [ ] `production` requires reviewers.
- [ ] Production deployments are restricted to `main`.
- [ ] `PRODUCTION_ENVIRONMENT` is an environment-scoped masked multiline secret on `production`.
- [ ] Image publication write permissions are job-scoped to the preview release job.
- [ ] Production promotion has read-only workflow, package, and attestation permissions.
- [ ] `Finalize release record` runs only after deployment and uses the protected `production` environment.
- [ ] Publication, promotion, deployment, and release-record finalization are not treated as the same approval boundary.
- [ ] Cloud access uses short-lived workload identity where possible.
- [ ] Image publication, production approval, deployment, release finalization, and rollback have named owners.

## Supply-chain evidence

- [ ] API, worker, and web SBOMs are generated in SPDX 2.3 JSON.
- [ ] Trivy reports are retained for each image.
- [ ] HIGH and CRITICAL findings fail unless an exact, owned, expiring exception exists.
- [ ] No expired, duplicate, broad, or stale vulnerability exception remains.
- [ ] Each published digest has the expected Cosign keyless signature.
- [ ] Each digest has GitHub build-provenance and SPDX SBOM attestations.
- [ ] The release manifest binds source workflow identity, browser build inputs, and all three digests.
- [ ] The production plan uses the same `name@sha256` references as the source release artifact.
- [ ] The registry and deployment platform preserve and enforce OCI evidence.

See [Image Supply Chain](Image-Supply-Chain).

## Production release-record evidence

After deployment, finalize the release record from `main` using the exact successful workflow run IDs and deployment facts:

- [ ] `source_run_id` names the successful `Release images` run.
- [ ] `promotion_run_id` names the successful `Promote release digests` run.
- [ ] The provider-specific backup/snapshot identifier and ISO-8601 capture time were recorded before migrations.
- [ ] The rollback observation window is a positive duration owned by the release team.
- [ ] Schema compatibility is recorded as `backward-compatible` or `roll-forward-only` with a concrete rationale.
- [ ] Finalization verifies the exact immutable digests, SBOMs, Trivy reports, signatures, build-provenance attestations, and SPDX attestations from the named release run.
- [ ] `migration-plan.production.json` binds the reviewed backup, migration inspection, and migration application steps.
- [ ] Release-profile smoke tests pass against the deployed environment.
- [ ] The complete `release-record-<VERSION>` bundle is retained, not only `release-record.json`.

A downloaded bundle can be validated locally with:

```bash
node tools/delivery/release-record.mjs validate \
  --record release-record.json \
  --manifest release-manifest.json \
  --base-directory .
```

See [Releases and Upgrades](Releases-and-Upgrades) for the complete finalization workflow.

## Secrets and configuration

- [ ] `.env` and production files are ignored and untracked.
- [ ] No development token, subject, tenant, or sample identity exists in production.
- [ ] Credentials are unique per environment and rotated.
- [ ] Browser public variables are reviewed as non-secrets.
- [ ] CORS, callbacks, cookies, domains, and trusted proxies match topology.
- [ ] Workflow logs do not print environment files or secret values.
- [ ] A secret manager and emergency rotation process exist.

## Authentication

- [ ] Provider login, callback, logout, and session endpoint are implemented.
- [ ] Issuer, audience, algorithms, and claims are validated.
- [ ] Session and refresh material remains server-side or in secure cookies.
- [ ] Valid, expired, wrong-issuer, wrong-audience, unknown-key, rotated-key, and permission-denied cases are exercised.
- [ ] Discovery/JWKS outage behavior and alerting are tested.
- [ ] Threat model covers application-specific identities and tenants.

## Data services

- [ ] Managed PostgreSQL uses TLS and least privilege.
- [ ] Pool limits account for replica and job concurrency.
- [ ] Backups, retention, restore tests, and RPO/RTO are documented.
- [ ] `BACKUP_OWNER` is an accountable person or team.
- [ ] Migration approval and data-repair ownership exist.
- [ ] Development seeds and reset access are removed.

## Worker and rate limiting

- [ ] PostgreSQL outbox capacity, retries, failures, replay, and drain have owners.
- [ ] Handlers are idempotent and external effects have timeouts.
- [ ] Worker metrics and readiness are monitored.
- [ ] Rate-limit store is PostgreSQL.
- [ ] Anonymous, authenticated, route, and tenant thresholds are load-tested.
- [ ] Trusted proxy hops match the shortest trusted ingress path.
- [ ] `429` and fail-closed `503 rate_limit_unavailable` have dashboards and incident response.

## Telemetry

- [ ] Production OTLP endpoint and credentials are configured.
- [ ] Logs and spans redact secrets and sensitive payloads.
- [ ] Sampling, retention, dashboards, alerts, SLOs, and escalation are defined.
- [ ] Service version matches the release version.
- [ ] Telemetry outage behavior is understood.

## Deployment infrastructure

- [ ] Images are built and published once from reviewed `main` source.
- [ ] The deployment consumes exact digest references from an approved promotion artifact.
- [ ] No production deployment rebuilds or retags the release.
- [ ] DNS, TLS, ingress, network policy, and domains are owned.
- [ ] Health/readiness probes are wired to the platform.
- [ ] Scaling and disruption behavior are tested.
- [ ] The deployment captures the release-specific backup identifier before migrations.
- [ ] Migration runs once before incompatible code.
- [ ] Rollout, rollback, and traffic-shift procedures are exercised.
- [ ] The deployed environment is reachable by the approved release smoke procedure.
- [ ] The `kubernetes` profile is not mistaken for generated manifests.

## Rollback and disaster recovery

- [ ] Previously approved release manifests, exact digests, and finalized release-record bundles remain available.
- [ ] Schema compatibility determines rollback versus roll-forward and is reconfirmed during incidents.
- [ ] Signatures and attestations are reverified before rollback.
- [ ] Database rollback is never automatic.
- [ ] The quarterly repository PostgreSQL restore exercise passes and its evidence is retained.
- [ ] A provider-specific production restore drill separately tests snapshot access, encryption/key recovery, permissions, networking, traffic switching, reconciliation, and declared RPO/RTO.
- [ ] Release rollback and disaster-recovery runbooks match the actual platform.
- [ ] Incident commander, contacts, and access paths are current.

The quarterly baseline exercise proves repository restore mechanics; it is not a substitute for the provider-specific production drill.

## Evidence retention

- [ ] `image-supply-chain-<VERSION>` is copied before its default 30-day retention expires when needed.
- [ ] `production-promotion-<VERSION>` is copied before its default 90-day retention expires when needed.
- [ ] `release-record-<VERSION>` is copied before its default 90-day retention expires.
- [ ] Quarterly restore-exercise evidence is copied before its default 90-day retention expires when needed.
- [ ] The complete release-record bundle, including hashed attachments, is stored durably when rollback/audit requirements exceed GitHub retention.
- [ ] Longer-term evidence storage has an owner, retention duration, access policy, legal-hold process, and deletion policy.

## Evidence required before launch

Record links or artifacts for:

- production readiness output;
- approved environment values;
- identity integration tests;
- preview smoke and performance results;
- image SBOMs and vulnerability reports;
- vulnerability exceptions and approvals;
- release manifest, source run, signatures, and attestations;
- production promotion approval and immutable release plan;
- deployment-specific backup identifier and capture time;
- finalized release record with migration-plan, schema/rollback decision, and deployed smoke evidence;
- quarterly baseline restore exercise and provider-specific production restore drill;
- threat-model review;
- branch and environment settings;
- rollback rehearsal;
- operational dashboards, alert routing, named owners, and launch approval.

## Release and deployment boundary

`Release images` publishes one signed and attested image set. `Promote release digests` approves the exact digests and creates a production plan. Neither workflow deploys the service. The adopting platform consumes the approved artifact and owns backup capture, migration execution, rollout, traffic shift, rollback, and provider-specific deployment evidence. After deployment, `Finalize release record` binds those deployment facts and deployed smoke results back to the exact approved release and promotion evidence.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Repository and GitHub Setup](Repository-and-GitHub-Setup)
- [Image Supply Chain](Image-Supply-Chain)
- [Authentication and Authorization](Authentication-and-Authorization)
- [Containers and Preview Environments](Containers-and-Preview-Environments)
- [Releases and Upgrades](Releases-and-Upgrades)

## Next steps

1. [Releases and Upgrades](Releases-and-Upgrades)
2. [Troubleshooting](Troubleshooting)

[Back to Home](Home)
