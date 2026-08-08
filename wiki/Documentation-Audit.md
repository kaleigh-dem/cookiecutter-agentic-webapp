# Documentation Audit

This page records the audit scope, information architecture, coverage matrix, verified command inventory, discrepancies, page disposition, and unresolved topics behind this wiki.

## Prerequisites

- None. This page is primarily for repository administrators, documentation owners, and template maintainers.

## Audit method

The wiki was derived from implementation and maintained repository documents, including:

- root `README.md`, `AGENTS.md`, `.mcp.json`, `package.json`, `nx.json`, `.env.example`, Compose
- application and database `project.json` files
- workspace plugin generator registry, schemas, shared utilities, and implementations
- GitHub Actions CI, Security, Delivery, Generated workspace, image release, digest promotion, release-record finalization, disaster-recovery, and wiki publication workflows
- getting started, initialization, architecture, authentication, rate limiting, database, worker, delivery, production readiness, upgrade, release, validation, runtime, security, migration, model/tool/stream/evaluation, and runbook documentation
- nested `AGENTS.md` files for web, API, worker, contracts, database, Agent Task domain, web feature, worker job, backend model, backend agent-tool, and backend agent-eval projects
- performance budget and smoke-test implementation
- merged PR #50 supply-chain evidence, PR #52 immutable promotion, PR #55 CI diagnostics, PR #59 cache-input auditing, PR #61 SteadyStack identity rebrand, PR #64 release records/recovery evidence, and PRs #65–#68 for the Phase 14 profile, model, tool/stream, and evaluation boundaries

The hidden GitHub wiki Git repository is not exposed through the ordinary repository contents API and does not support the main repository's pull-request workflow. Reviewed source is maintained under `wiki/`. After a reviewed wiki change reaches `main`, `.github/workflows/wiki-publish.yml` synchronizes it to `steady-stack.wiki.git`, preserves wiki-only pages except those explicitly listed in `wiki/deletions.txt`, and rejects every unapproved deletion. `docs/wiki-publication.md` documents the manual fallback.

## Final information architecture

1. Home
2. Agentic Development Model
3. Quick Start
4. Choosing Workspace Profiles
5. Repository Tour
6. Everyday Development
7. Code Generation
8. Architecture
9. Optional AI Runtime
10. Authentication and Authorization
11. Database and Data Management
12. Worker and Background Jobs
13. Validation and Testing
14. CI Diagnostics
15. Containers and Preview Environments
16. Repository and GitHub Setup
17. Image Supply Chain
18. Production Readiness
19. Releases and Upgrades
20. Troubleshooting
21. Documentation Audit
22. `_Sidebar` and `_Footer`

Naming uses title case for page headings and hyphenated GitHub Wiki filenames. Cross-links use wiki page slugs. Repository file links point at stable `main` paths and explain the file's role.

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
| Optional AI profile/model/tool/stream/evaluation boundaries               | Optional AI Runtime                 |
| Development, none, OIDC, session, claims, outage                          | Authentication and Authorization    |
| PostgreSQL, migrations, seed, reset, backups                              | Database and Data Management        |
| Outbox, leasing, retries, replay, metrics, drain                          | Worker and Background Jobs          |
| `pnpm check`, focused commands, budgets, clean tree                       | Validation and Testing              |
| AI evaluation-evidence gate and focused model/tool/eval checks            | Validation and Testing              |
| Documentation-integrity commands, upstream-only audit scope, graph checks | Validation and Testing              |
| Documentation-integrity failure artifact and graph remediation            | CI Diagnostics                      |
| Cancellation, failure artifacts, traces, logs, cache fallback             | CI Diagnostics                      |
| Images, preview, smoke, performance, cleanup                              | Containers and Preview Environments |
| Repository controls, environments, permissions, retention                 | Repository and GitHub Setup         |
| SBOMs, Trivy, policy, signatures, attestations, digests                   | Image Supply Chain                  |
| Governance, secrets, identity, data, operations, evidence                 | Production Readiness                |
| Release promotion, finalization, recovery evidence, upgrade walkthrough   | Releases and Upgrades               |
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
pnpm docs:architecture
pnpm docs:check
pnpm agent-eval:check
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

`pnpm docs:architecture` and `pnpm docs:check` are P13-05 template-maintainer commands. In `@steadystack/source`, they generate/check the committed Nx architecture graph and run the documentation content/topology audit. Initialized products retain the deterministic checker tests but skip the upstream repository audit; product teams must add product-specific rules if they want equivalent enforcement.

`pnpm agent-eval:check` is the P14-04 evidence gate. It validates committed evidence manifests and, when Nx supplies a comparison range in CI, requires evidence updates for governed prompt artifacts and non-test model/tool runtime behavior changes.

Template-maintainer-only release scripts were intentionally not presented as generated-workspace everyday commands. Release-record finalization and the quarterly restore exercise are GitHub Actions workflows rather than root package scripts.

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
pnpm nx run backend-model:lint
pnpm nx run backend-model:typecheck
pnpm nx run backend-model:test
pnpm nx run backend-model:build
pnpm nx run backend-agent-tool:lint
pnpm nx run backend-agent-tool:typecheck
pnpm nx run backend-agent-tool:test
pnpm nx run backend-agent-tool:build
pnpm nx run backend-agent-eval:lint
pnpm nx run backend-agent-eval:typecheck
pnpm nx run backend-agent-eval:test
pnpm nx run backend-agent-eval:build
pnpm nx run backend-agent-eval:evidence-check
```

### Generator options confirmed

- `domain`: name, internal skip-format
- `feature`: name, internal skip-format
- `job`: name, queue default `default`, internal skip-format
- `contract`: name, internal skip-format
- initialization: identity, apps, ports/database, auth, worker transport, telemetry, deployment, AI

## Discrepancies and important reconciliations

### Documentation integrity is upstream-specific

P13-05 adds deterministic documentation-integrity enforcement for the reviewed upstream template package, `@steadystack/source`. Initialization changes product identity, can remove projects through profile selection, and removes maintainer-only workflows and documents. For that reason, initialized products run the checker’s deterministic unit tests but intentionally skip the upstream content/topology audit. The wiki labels `pnpm docs:check` and `pnpm docs:architecture` accordingly and directs adopters to define product-owned rules when they need equivalent enforcement.

### SteadyStack public identity

SteadyStack is the canonical repository-owned identity. Current package manifests, generator guidance, upgrade commands, release artifacts, repository links, wiki publication, authentication defaults, and generated-workspace provenance use the SteadyStack forms. Generated products choose and retain their own application identity.

The repository had no released generated users before the SteadyStack public identity became canonical. For that reason, the end-user wiki documents only current names and does not publish a separate identity-transition guide. Historical mapping and compatibility details remain in `docs/steadystack-migration.md` for maintainers.

### Reviewed rendered-wiki deletions

Checked-in Markdown remains the authoritative reviewed page set. Pages that exist only in the rendered wiki are preserved by default. A rendered page is deleted only when its top-level `.md` filename is listed in `wiki/deletions.txt`, the corresponding reviewed source is absent, navigation no longer references it, and no unapproved deletion is staged. The manifest remains as an auditable, idempotent record.

### Agentic compatibility versus optional product AI

Agentic compatibility is a baseline repository property implemented through `AGENTS.md`, Nx graph and MCP context, generators, executable boundaries, validation, and upgrades. The `ai` initialization flag only records product intent to add AI-powered application features.

Phase 14 now adds reusable runtime primitives in the upstream source: provider-neutral model interfaces, OpenAI native-`fetch` plus deterministic adapters, typed authorization-enforced tools, a strict V1 NDJSON browser stream, and reviewed prompt/evaluation evidence. These capabilities remain uncomposed in the default applications. `ai=false` is still the default, and `ai=true` does not yet generate a runnable AI workflow. The wiki therefore documents both the implemented boundaries and the remaining durable-execution, broader safety/fallback, and generated-profile work.

### Worker operations port exposure

`docs/worker-operations.md` says the operations port is intended to be internal and not host-published by the baseline deployment. `infra/deploy/compose.preview.yaml` maps `4001:4001` to support local smoke and performance checks. The wiki documents the implementation and warns that production exposure is a deployment decision.

### Preview command duplication

Several overview sequences show:

```bash
pnpm containers:build
pnpm preview:up
pnpm preview:smoke
```

The `preview:up` implementation itself builds images and runs smoke after startup. The wiki explains that the explicit build and smoke commands are useful for isolation or repetition but are redundant in the shortest path.

### Image publication, promotion, deployment, and finalization are separate

The release implementation uses one-time image publication plus read-only production promotion. The adopting platform then performs deployment. P13-06 adds a protected post-deployment `Finalize release record` workflow that binds the exact successful release and promotion runs to the provider-specific backup identifier, approved migration steps, rollback window/schema decision, supply-chain artifacts, and deployed smoke results. None of the publication, promotion, or finalization workflows silently substitutes for the deployment platform.

### Redis and Kubernetes profile status

Both are valid initialization metadata, but Redis delivery and organization-specific Kubernetes deployment are not implemented. The wiki does not describe them as operational.

### OIDC/session completeness

The repository implements an OIDC API verifier and browser credential adapter. Provider login/callback/logout and the secure server-session credential endpoint remain adopter-owned. The wiki preserves this distinction.

### CI cancellation, cache, and failure evidence

PR #55 completed pull-request-only cancellation, optional BuildKit cache reuse, and retained diagnostics. Delivery uses `.cache/buildkit`; Generated workspace stores cache state outside its temporary source copy at `../buildkit-cache`. Cache failure affects speed, not correctness. Failure bundles are retained for 14 days.

P13-05 extends the retained CI bundle for stale documentation architecture validation: the expected `project-graph.md` is written into the CI diagnostics directory so reviewers can compare the generated correction candidate with the committed graph. CI Diagnostics documents this failure class and the `pnpm docs:architecture` / `pnpm docs:check` remediation path.

### Artifact retention is bounded

The supply-chain artifact defaults to 30-day retention. Production promotion, finalized release records, and the quarterly repository restore-exercise evidence default to 90 days. The wiki treats those GitHub artifacts as bounded handoff/review copies and requires adopters to persist complete release-record bundles in their durable system of record when rollback, audit, incident, or regulatory retention exceeds that window.

The quarterly isolated PostgreSQL restore exercise proves the repository baseline recovery path; it does not replace provider-specific production DR testing for snapshot access, encryption/key recovery, permissions, networking, traffic switching, reconciliation, and declared RPO/RTO.

### `pnpm check` scope

`pnpm check` now includes `pnpm agent-eval:check` immediately after documentation integrity. It still does not run identity validation, telemetry Compose validation, preview lifecycle, production readiness, a real provider reachability test, or release-record finalization. Those are documented separately.

## Existing documentation disposition

| Existing content                    | Disposition                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Root README                         | Reframed around the agentic-development thesis and SteadyStack identity while retaining concise operating guidance. |
| `docs/agentic-development.md`       | Repository-local source for agent workflow, control surfaces, approval boundaries, and anti-patterns.               |
| `docs/getting-started.md`           | Expanded for agent-ready onboarding and merged into Quick Start, Profiles, Production Readiness.                    |
| `docs/template-initialization.md`   | Merged into Profiles and Releases/Upgrades.                                                                         |
| `docs/model-interfaces.md`          | End-user model boundary summarized in Optional AI Runtime.                                                          |
| `docs/typed-tools-and-streaming.md` | Typed tool authorization and V1 transport summarized in Optional AI Runtime and Architecture.                       |
| `docs/prompt-evaluation-lifecycle.md` | Prompt/evaluation lifecycle summarized in Optional AI Runtime and Validation/Testing.                             |
| `docs/delivery/release-records.md`  | Release finalization and baseline restore evidence merged into Releases/Upgrades, Production Readiness, Troubleshooting. |
| `docs/steadystack-migration.md`     | Retained as maintainer-only historical identity and compatibility evidence; no separate end-user wiki page.         |
| Architecture docs and ADR summaries | Reorganized into Repository Tour, Architecture, and Optional AI Runtime.                                             |
| Auth docs                           | Merged into Authentication and Authorization, with local/production separation.                                     |
| Database docs                       | Expanded into task-based database page.                                                                             |
| Worker docs                         | Merged into operations-focused worker page.                                                                         |
| Delivery docs                       | Merged into Containers/Preview, Image Supply Chain, Repository/GitHub Setup, Releases, and Production Readiness.    |
| Generated project checklist         | Expanded with agent-readiness governance and reorganized into launch checklist with automated/human distinction.    |
| Workspace plugin README             | Reframed as the deterministic structural write API for humans and coding agents.                                    |
| Template release/upgrade docs       | Split by generated-workspace user tasks; maintainer procedures labeled.                                             |
| Runbooks                            | Summarized and linked conceptually from Production Readiness and Troubleshooting.                                   |
| Existing first wiki page            | Replaced by the authored Home source; its exact remote content could not be retrieved through the contents API.     |

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

### Organization-specific durable release-evidence retention

The repository now creates validated release-record bundles and retains GitHub handoff copies for 90 days, but an adopting organization must still define:

- durable evidence store and retention duration
- export/ingestion automation and access policy
- legal or regulatory requirements and incident holds
- deletion policy
- accountable evidence owner

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

### Production model-provider composition

SteadyStack supplies reusable optional AI boundaries but intentionally does not choose production composition. Needed information includes:

- approved provider/model/region allowlist and credentials
- application data-classification and retention policy
- provider-side retention/training terms
- tool allowlist and audit policy
- prompt/application persistence policy
- fallback and safety policy
- durable-execution adapter when required
- quality/latency/token/cost budgets and production monitoring

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
- provider-specific restore procedure and measured duration
- approved business RPO/RTO
- named owners

## Final review against end-user tasks

The page set provides a direct path to:

- understand SteadyStack's agentic-development purpose and approval model
- configure a safe agent access and repository governance model
- create and initialize a workspace
- run it locally
- make and validate a focused change
- generate a domain, feature, contract, or job
- understand synchronous and asynchronous architecture
- understand and safely compose the current optional AI model/tool/stream/evaluation boundaries
- build and validate the preview environment
- identify production replacement points
- publish/promote immutable images and finalize production release evidence
- perform a dry-run and applied upgrade
- diagnose common runtime, delivery, release-record, recovery, and CI symptoms

Runtime execution should still be repeated in the generated repository's CI and target environment because documentation verification cannot replace the repository's own test and delivery contracts.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Home](Home)
- [Optional AI Runtime](Optional-AI-Runtime)
- [Production Readiness](Production-Readiness)
- [Releases and Upgrades](Releases-and-Upgrades)

## Next steps

1. [Home](Home)

[Back to Home](Home)
