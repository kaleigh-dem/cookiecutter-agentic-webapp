# Documentation Audit

This page records the audit scope, information architecture, coverage matrix, verified command inventory, discrepancies, page disposition, and unresolved topics behind this wiki.

## Prerequisites

- None. This page is primarily for repository administrators, documentation owners, and template maintainers.

## Audit method

The wiki was derived from implementation and maintained repository documents, including:

- root `README.md`, `AGENTS.md`, `.mcp.json`, `package.json`, `nx.json`, `.env.example`, Compose
- application and database `project.json` files
- workspace plugin generator registry, schemas, shared utilities, and implementations
- GitHub Actions CI, Security, Delivery, Generated workspace, image release, and digest promotion workflows
- getting started, initialization, architecture, authentication, rate limiting, database, worker, delivery, production readiness, upgrade, release, validation, runtime, security, and runbook documentation
- nested `AGENTS.md` files for web, API, worker, contracts, database, Agent Task domain, web feature, and worker job
- performance budget and smoke-test implementation
- merged PR #50 image supply-chain implementation and open PR #52 immutable digest-promotion branch

The repository connector could not expose the hidden GitHub wiki Git repository through the ordinary contents API, even after its first page was created. This reviewed source is therefore maintained under `wiki/` in the main repository and can be synchronized to the wiki Git repository after review. GitHub wiki repositories do not expose the normal pull-request workflow through the connected interface.

## Final information architecture

1. Home
2. Agentic Development Model
3. Quick Start
4. Choosing Workspace Profiles
5. Repository Tour
6. Everyday Development
7. Code Generation
8. Architecture
9. Authentication and Authorization
10. Database and Data Management
11. Worker and Background Jobs
12. Validation and Testing
13. Containers and Preview Environments
14. Repository and GitHub Setup
15. Image Supply Chain
16. Production Readiness
17. Releases and Upgrades
18. Troubleshooting
19. Documentation Audit
20. `_Sidebar` and `_Footer`

Naming uses title case for page headings and hyphenated GitHub Wiki filenames. Cross-links use wiki page slugs. Repository file links point at stable `main` paths and explain the file’s role.

## Coverage matrix

| Requirement/source area                                                   | Wiki coverage                       |
| ------------------------------------------------------------------------- | ----------------------------------- |
| Platform description, audience, included/not included                     | Home                                |
| Agentic development thesis, workflow, guardrails, and approval boundaries | Agentic Development Model           |
| Tool versions and local startup                                           | Quick Start                         |
| Initialization options and compatibility                                  | Choosing Workspace Profiles         |
| Apps, packages, infrastructure, tooling, docs                             | Repository Tour                     |
| Common Nx workflows                                                       | Everyday Development                |
| Domain/feature/job/contract generators                                    | Code Generation                     |
| Monorepo, request/data/worker flows, boundaries                           | Architecture                        |
| Development, none, OIDC, session, claims, outage                          | Authentication and Authorization    |
| PostgreSQL, migrations, seed, reset, backups                              | Database and Data Management        |
| Outbox, leasing, retries, replay, metrics, drain                          | Worker and Background Jobs          |
| `pnpm check`, focused commands, budgets, clean tree                       | Validation and Testing              |
| Images, preview, smoke, performance, cleanup                              | Containers and Preview Environments |
| Repository controls, environments, permissions, retention                 | Repository and GitHub Setup         |
| SBOMs, Trivy, policy, signatures, attestations, digests                   | Image Supply Chain                  |
| Governance, secrets, identity, data, operations, evidence                 | Production Readiness                |
| Release artifacts, provenance, upgrade walkthrough                        | Releases and Upgrades               |
| Symptom-based diagnostics                                                 | Troubleshooting                     |
| Audit, discrepancies, verified commands, gaps                             | Documentation Audit                 |

## Verified commands

“Verified” means the command was matched to a root script, Nx target, generator schema, or implementation path. It does not mean this documentation session executed Docker or installed dependencies.

### Root scripts confirmed in `package.json`

```text
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm sync:check
pnpm check
pnpm affected
pnpm graph
pnpm format
pnpm format:check
pnpm security:secrets
pnpm security:audit
pnpm security:licenses
pnpm supply-chain:check
pnpm delivery:check
pnpm deploy:config:check
pnpm production:check
pnpm performance:check
pnpm performance:load
pnpm containers:build
pnpm preview:up
pnpm preview:down
pnpm preview:smoke
pnpm release:plan
pnpm release:manifest:check
pnpm initialize:workspace
pnpm template:identity:check
pnpm generate:domain
pnpm generate:feature
pnpm generate:job
pnpm generate:contract
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:compat
pnpm db:migration:create
pnpm db:migrate
pnpm db:rollback
pnpm db:status
pnpm db:seed
pnpm db:reset
pnpm outbox:list-failed
pnpm outbox:replay
pnpm infra:up
pnpm infra:down
pnpm telemetry:up
pnpm telemetry:logs
pnpm telemetry:down
pnpm telemetry:check
```

Template-maintainer-only release scripts were intentionally not presented as generated-workspace everyday commands.

### Project targets confirmed

```text
pnpm nx run web:dev
pnpm nx run web:typecheck
pnpm nx run web:test
pnpm nx run web:build
pnpm nx run web:container
pnpm nx run api:serve
pnpm nx run api:typecheck
pnpm nx run api:test
pnpm nx run api:build
pnpm nx run api:container
pnpm nx run worker:serve
pnpm nx run worker:typecheck
pnpm nx run worker:test
pnpm nx run worker:build
pnpm nx run worker:container
pnpm nx run database:test
```

### Generator options confirmed

- `domain`: name, internal skip-format
- `feature`: name, internal skip-format
- `job`: name, queue default `default`, internal skip-format
- `contract`: name, internal skip-format
- initialization: identity, apps, ports/database, auth, worker transport, telemetry, deployment, AI

## Discrepancies and important reconciliations

### Agentic compatibility versus optional product AI

Agentic compatibility is a baseline repository property implemented through `AGENTS.md`, Nx graph and MCP context, generators, executable boundaries, validation, and upgrades. The `ai` initialization flag only records product intent to add AI-powered application features. The wiki now states this distinction explicitly.

### Worker operations port exposure

`docs/worker-operations.md` says the operations port is intended to be internal and not host-published by the baseline deployment. `infra/deploy/compose.preview.yaml` maps `4001:4001` to support local smoke and performance checks. The wiki documents the implementation and warns that production exposure is a deployment decision.

### Preview command duplication

Several overview sequences show:

```bash
pnpm containers:build
pnpm preview:up
pnpm preview:smoke
```

The `preview:up` implementation itself builds images and runs smoke after startup. The wiki explains that the explicit build and smoke commands are useful for isolation/repetition but are redundant in the shortest path.

### Image publication, promotion, and deployment are separate

The digest-promotion implementation changes the release model from optional mutable-tag publication to one-time image publication plus read-only production promotion. The wiki documents that `Release images` publishes once, `Promote release digests` approves exact digests, and the adopting platform performs deployment. Neither workflow deploys the service.

### Redis and Kubernetes profile status

Both are valid initialization metadata, but Redis delivery and organization-specific Kubernetes deployment are not implemented. The wiki does not describe them as operational.

### OIDC/session completeness

The repository implements an OIDC API verifier and browser credential adapter. Provider login/callback/logout and the secure server-session credential endpoint remain adopter-owned. The wiki preserves this distinction.

### Artifact retention is bounded

The supply-chain artifact defaults to 30-day retention and the production promotion artifact defaults to 90 days. The wiki identifies longer-term evidence retention as adopter-owned until future P13-06 work is implemented.

### `pnpm check` scope

`pnpm check` does not run identity validation, telemetry Compose validation, preview lifecycle, production readiness, or a real provider reachability test. Those are documented separately.

## Existing documentation disposition

| Existing content                    | Disposition                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Root README                         | Reframed around the agentic-development thesis while retaining concise platform and operating guidance.            |
| `docs/agentic-development.md`       | Added as the repository-local source for agent workflow, control surfaces, approval boundaries, and anti-patterns. |
| `docs/getting-started.md`           | Expanded for agent-ready onboarding and merged into Quick Start, Profiles, Production Readiness.                   |
| `docs/template-initialization.md`   | Merged into Profiles and Releases/Upgrades.                                                                        |
| Architecture docs and ADR summaries | Reorganized into Repository Tour and Architecture.                                                                 |
| Auth docs                           | Merged into Authentication and Authorization, with local/production separation.                                    |
| Database docs                       | Expanded into task-based database page.                                                                            |
| Worker docs                         | Merged into operations-focused worker page.                                                                        |
| Delivery docs                       | Merged into Containers/Preview, Image Supply Chain, Repository/GitHub Setup, Releases, and Production Readiness.   |
| Generated project checklist         | Expanded with agent-readiness governance and reorganized into launch checklist with automated/human distinction.   |
| Workspace plugin README             | Reframed as the deterministic structural write API for humans and coding agents.                                   |
| Template release/upgrade docs       | Split by generated-workspace user tasks; maintainer procedures labeled.                                            |
| Runbooks                            | Summarized and linked conceptually from Production Readiness and Troubleshooting.                                  |
| Existing first wiki page            | Replaced by the authored Home source; its exact remote content could not be retrieved through the available API.   |

No source documentation should be deleted solely because it is represented in the wiki; repository-local docs remain versioned evidence and implementation-adjacent references.

## Topics not confidently documentable from implementation

### Organization-specific agent platform and access model

Needed information:

- approved coding-agent products and hosting model
- repository permission level and branch strategy
- credential lifetime and secret-broker design
- allowed external tools and network destinations
- data-classification restrictions
- audit-log and session-retention requirements
- human approval points and emergency revocation owner

### Long-term release-evidence retention

Needed information:

- evidence store and retention duration
- export automation and access policy
- legal or regulatory requirements
- deletion and incident-hold process
- owner for future P13-06 implementation

### Provider-specific login/session implementation

Needed information:

- chosen identity provider
- application/client type
- callback and logout URLs
- session store and cookie policy
- refresh/token exchange method
- role/permission mapping
- provider SDK and operational owner

### Real production deployment

Needed information:

- cloud/platform and region
- registry and workload identity
- ingress/TLS/DNS
- secret/config mechanism
- migration job
- scaling and rollout controller
- environment approval
- deployment and rollback commands

### Redis worker transport

Needed information:

- adapter code and contract
- infrastructure
- durable ownership semantics
- retry/dead-letter/replay behavior
- metrics and operations
- backup/recovery
- tests proving parity

### Kubernetes deployment

Needed information:

- manifests or chart
- namespaces and service accounts
- ingress and network policy
- secret references
- probes and resources
- autoscaling/disruption budgets
- migration and rollout jobs

### Backup provider and exact RPO/RTO

Needed information:

- PostgreSQL provider
- backup frequency/retention
- cross-account or immutable storage
- restore procedure and measured duration
- approved business RPO/RTO
- named owners

## Final review against end-user tasks

The page set provides a direct path to:

- understand the template's agentic-development purpose and approval model
- configure a safe agent access and repository governance model
- create and initialize a workspace
- run it locally
- make and validate a focused change
- generate a domain, feature, contract, or job
- understand synchronous and asynchronous architecture
- build and validate the preview environment
- identify production replacement points
- perform a dry-run and applied upgrade
- diagnose the required common symptoms

Runtime execution should still be repeated in the generated repository’s CI and target environment because documentation verification cannot replace the repository’s own test and delivery contracts.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Home](Home)
- [Production Readiness](Production-Readiness)
- [Releases and Upgrades](Releases-and-Upgrades)

## Next steps

1. [Home](Home)

[Back to Home](Home)
