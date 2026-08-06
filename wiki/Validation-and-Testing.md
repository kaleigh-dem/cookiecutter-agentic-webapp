# Validation and Testing

This page explains the executable feedback loop used by humans and AI agents: what repository validation proves, what it does not prove, and which focused commands to use while iterating.

## Prerequisites

- Dependencies installed.
- Docker available for integration and preview work.
- A valid browser authentication profile when building web production artifacts.

## Validation is the agent feedback loop

Agentic development is reliable only when completion criteria are executable. Use three layers:

1. **Focused feedback** for the project or boundary being changed.
2. **Affected validation** for dependents discovered by Nx.
3. **The full repository contract** before review or merge.

A green command is evidence for a specific contract, not proof that the product requirement is correct or that production risk has been approved. Agents should report exactly which commands ran and humans should review the diff and remaining decisions.

## Full repository contract

```bash
pnpm check
```

`pnpm check` runs, in order:

1. `pnpm sync:check`
2. `pnpm contracts:check`
3. `pnpm contracts:compat`
4. `pnpm format:check`
5. `pnpm security:secrets`
6. `pnpm security:audit`
7. `pnpm security:licenses`
8. `pnpm delivery:check`
9. `pnpm lint`
10. `pnpm typecheck`
11. `pnpm test`
12. `pnpm build`

The command stops at the first failing stage.

## What each stage validates

### Workspace synchronization

```bash
pnpm sync:check
```

Verifies Nx synchronization tasks do not need to change tracked workspace files.

### Generated contracts

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:compat
```

- `generate` writes current generated artifacts.
- `check` fails when committed generated artifacts drift from source.
- `compat` checks the maintained compatibility baseline.

Never edit generated contract files directly.

### Formatting

```bash
pnpm format:check
```

Use `pnpm format` to apply fixes.

### Security policy

```bash
pnpm security:secrets
pnpm security:audit
pnpm security:licenses
```

These enforce tracked secret patterns, dependency vulnerability policy, and production dependency license policy. They are baseline controls, not a complete penetration test or legal review.

### Delivery configuration

```bash
pnpm delivery:check
```

The delivery contract includes:

```bash
pnpm deploy:config:check
pnpm release:manifest:check
pnpm performance:check
pnpm supply-chain:check
```

- `deploy:config:check` validates checked-in deployment examples and configuration rules.
- `release:manifest:check` validates the checked-in release-manifest example against the current schema.
- `performance:check` validates performance-budget configuration.
- `supply-chain:check` validates vulnerability-policy and exception definitions.

These commands do not scan a registry or verify a published release. Image scans, signatures, and attestations run in the release workflows.

### Lint and architectural boundaries

```bash
pnpm lint
```

Includes scope, runtime, and project-type dependency rules plus contract-duplication restrictions.

### Type checking

```bash
pnpm typecheck
```

Runs project typecheck targets through Nx.

### Unit and integration tests

```bash
pnpm test
```

Includes project tests. Database integration tests own their PostgreSQL container lifecycle and may be slower.

### Production builds

```bash
pnpm build
```

Builds all projects. Generic CI supplies a production-safe browser profile for compilation. Release images use the reviewed browser inputs recorded in the release manifest.

## Validation outside `pnpm check`

Important separate validation includes:

```bash
pnpm template:identity:check
pnpm telemetry:check
pnpm containers:build
pnpm preview:up
pnpm preview:smoke
pnpm performance:load
pnpm production:check -- <ENVIRONMENT_FILE>
```

Do not assume `pnpm check` proves the preview lifecycle, exact production configuration, identity replacement, provider reachability, backups, repository governance, image publication, signatures, attestations, or production approval.

## Focused developer commands

```bash
pnpm nx run <PROJECT>:lint
pnpm nx run <PROJECT>:typecheck
pnpm nx run <PROJECT>:test
pnpm nx run <PROJECT>:build
```

Affected validation:

```bash
pnpm affected
```

Security integration without cache:

```bash
pnpm nx run api:test --skip-nx-cache
```

Delivery and supply-chain tests:

```bash
pnpm supply-chain:check
pnpm release:manifest:check
pnpm nx test delivery --skip-nx-cache
pnpm delivery:check
```

Database:

```bash
pnpm nx run database:test
pnpm db:migrate
pnpm db:status
```

Worker:

```bash
pnpm nx run worker:test
pnpm nx run worker:typecheck
pnpm nx run worker:build
```

## E2E and preview validation

CI installs Chromium and runs affected `e2e` targets. The production-shaped preview separately runs deployed-image smoke tests and performance scenarios.

The release smoke profile checks:

- web home returns 200;
- API liveness returns 200;
- API readiness returns 200;
- API metrics requires authentication.

The local `live-agent-task` profile additionally checks worker liveness, readiness, and metrics and creates an Agent Task that must reach `succeeded`.

## CI concurrency and retained failure evidence

PR #55 implemented pull-request-only cancellation, cache-aware container builds, and retained failure evidence. Required workflows cancel an older in-progress run only when a newer commit supersedes it on the same pull request. `main`, scheduled, and manually dispatched runs remain protected from this cancellation rule. A cancelled run is not a passing result; reviewers must verify checks for the exact pull-request head SHA.

After a failure, use the retained artifact that matches the workflow:

- `ci-failure-<run_id>-<run_attempt>` for Playwright evidence and the generated CI release plan;
- `delivery-failure-<run_id>-<run_attempt>` for preview service logs and performance JSON;
- `generated-workspace-diagnostics-<run_id>-<run_attempt>` for the generated repository's diagnostic bundle.

Artifacts are retained for 14 days. See [CI Diagnostics](CI-Diagnostics) for the artifact-to-failure lookup, Playwright trace inspection, release-plan review, generated-workspace evidence, and deterministic local fallback commands.

## Image release validation

The image release workflow adds checks that local `pnpm check` cannot reproduce by itself:

- SBOM generation for all three production images;
- Trivy scans;
- fail-closed vulnerability-policy evaluation;
- immutable version publication;
- registry digest resolution;
- Cosign keyless signatures;
- GitHub build-provenance and SPDX attestations;
- release-manifest creation.

Production promotion then validates the source run, manifest, protected production values, signatures, attestations, and digest-based release plan without rebuilding.

See [Image Supply Chain](Image-Supply-Chain) and [Releases and Upgrades](Releases-and-Upgrades).

## Performance budgets

Default load settings:

- 30 requests;
- concurrency 5;
- 5-second request timeout.

| Scenario         | Maximum P95 | Maximum error rate |
| ---------------- | ----------: | -----------------: |
| API liveness     |      250 ms |                 1% |
| Worker liveness  |      250 ms |                 1% |
| Worker readiness |      500 ms |                 1% |
| Web home         |      750 ms |                 1% |

These are release gates for the reference environment, not universal production SLOs.

## Git cleanliness

After generation, validation, and production build:

```bash
git status --short
git diff --exit-code
```

A dirty tree means generated or synchronized content changed, formatting was not committed, or a build wrote tracked output. Inspect before discarding.

## Pull-request sequence

```bash
pnpm format
pnpm affected
pnpm check
pnpm template:identity:check
git status --short
```

For delivery or supply-chain changes, add:

```bash
pnpm supply-chain:check
pnpm release:manifest:check
pnpm nx test delivery --skip-nx-cache
pnpm preview:up
pnpm performance:load
pnpm preview:down
```

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Everyday Development](Everyday-Development)
- [CI Diagnostics](CI-Diagnostics)
- [Image Supply Chain](Image-Supply-Chain)
- [Containers and Preview Environments](Containers-and-Preview-Environments)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [CI Diagnostics](CI-Diagnostics)
2. [Image Supply Chain](Image-Supply-Chain)
3. [Production Readiness](Production-Readiness)

[Back to Home](Home)
