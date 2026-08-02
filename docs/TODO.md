# Template Roadmap

Last updated: 2026-08-02

This file tracks active work required to turn the repository from a validated reference application into a reusable, upgradeable application platform. Completed implementation history remains available in merged pull requests, ADRs, and Git history instead of being repeated as checked-off tasks here.

## Completed baseline

Phases 2–9 established the current foundation:

- Nx workspace migration and enforceable project boundaries
- architecture-aware domain, feature, job, and contract generators
- PostgreSQL migrations, integration tests, repositories, and transactional outbox storage
- deterministic OpenAPI generation and browser client generation
- a vertical Agent Tasks reference feature
- structured logging, OpenTelemetry, health checks, and runbooks
- authentication and authorization boundaries plus security CI
- production images, preview validation, release planning, and performance budgets

Relevant merged work is recorded in PRs #2–#10 and `docs/adr/`.

## Status conventions

- `[ ]` planned
- `[-]` in progress
- `[x]` completed and verified
- `[!]` blocked; include the blocker and decision required

## Maintenance rules

1. Keep task IDs stable after they appear in a PR, issue, release note, or ADR.
2. Update this file in every PR that changes roadmap status, sequencing, scope, or exit criteria.
3. Mark work complete only after implementation, tests, documentation, and applicable CI checks pass.
4. Add newly discovered work under the closest phase instead of hiding it in PR comments.
5. Record intentional deferrals with a reason and the phase or condition that should reopen them.
6. Split tasks when a PR would otherwise mix unrelated architectural changes.

## Execution order

1. Complete Phase 10 before generating production projects from the template.
2. Complete Phase 11 before calling Agent Tasks a complete asynchronous reference workflow.
3. Complete Phase 12 before production deployment of a generated application.
4. Phase 13 can proceed in parallel after Phase 10 establishes the template release lifecycle.
5. Phase 14 is optional and must not add AI dependencies to the default workspace profile.

## Phase 10 — Template productization

Goal: make workspace creation, customization, validation, release, and downstream upgrades reliable across multiple independent repositories.

Tasks are listed in implementation order. Existing task IDs remain stable for review and issue references, so P10-02 intentionally follows its P10-03 through P10-05 prerequisites.

- [x] **P10-01 Replace Node 25 with an active LTS baseline.**
  - Pin Node 24 in `package.json`, GitHub Actions, Docker build arguments, and developer tooling.
  - Add `.node-version` or `.tool-versions` and document the runtime support policy.
  - Add a non-blocking compatibility job for the current even-numbered Node release when useful.
  - Verify local builds, production images, Playwright, Testcontainers, and release tooling on the LTS version.

- [x] **P10-03 Introduce a parameterized Nx preset or initialization generator.**
  - Accept application slug, display name, package scope, repository owner, CODEOWNERS, ports, database name, and selected applications.
  - Add options for authentication, worker transport, telemetry, deployment profile, and optional AI capabilities.
  - Validate names and incompatible option combinations before writing files.
  - Keep generation deterministic and covered by unit and snapshot tests.

- [x] **P10-04 Remove hard-coded template identity.**
  - Parameterize `@agentic-webapp`, service names, Compose project names, OCI image names and labels, database defaults, telemetry service names, and custom TypeScript conditions.
  - Replace personal CODEOWNERS entries with generated owners or documented placeholders.
  - Add a repository-wide placeholder detector to CI.
  - Permit intentional references to the upstream template only in attribution and upgrade metadata.

- [x] **P10-05 Establish template versioning and release automation.**
  - Define semantic-versioning rules for template changes.
  - Generate changelogs and tagged releases.
  - Record the originating template version in each generated repository.
  - Publish the preset or plugin through a stable distribution channel.
  - Add a minimal release smoke test that installs the published artifact and invokes its preset entry point.

- [x] **P10-02 Add generated-workspace end-to-end CI.**
  - Depend on P10-03, P10-04, and P10-05 so CI validates a parameterized, identity-neutral, released artifact.
  - Create a clean temporary workspace from the released preset or tagged template through the documented Nx command.
  - Use a name and package scope that differ from this repository.
  - Install with a frozen lockfile and run the generated workspace validation contract.
  - Apply migrations and seeds, build images, start the preview stack, run smoke and performance checks, and verify deterministic teardown.
  - Fail when the generated repository is dirty or retains unintended upstream-template identity after validation.

- [x] **P10-06 Add a downstream upgrade strategy.**
  - Implement Nx migrations or explicit codemods for breaking template changes.
  - Define which files are template-managed, generated-once, or application-owned.
  - Add an upgrade command with dry-run output and conflict guidance.
  - Test upgrading at least one fixture from the previous released template version.
  - Document how generated repositories receive dependency and template updates.

- [x] **P10-07 Refresh onboarding and template documentation.**
  - Remove language that says the template migration is under review once template E2E passes.
  - Document supported profiles, required local tooling, first-run commands, and production replacement points.
  - Add a generated-project checklist covering repository settings, secrets, environments, ownership, and branch protection.

Exit criteria: a tagged release can generate a differently named repository, pass the full validation and preview lifecycle, contain no unintended template identity, and upgrade from the previous template release through a documented command.

## Phase 11 — Complete asynchronous reference workflow

Goal: make the worker and transactional outbox a functioning end-to-end example rather than isolated infrastructure and handler examples.

- [x] **P11-01 Record the worker delivery design.**
  - Decide whether the baseline uses PostgreSQL outbox polling, Redis-backed queues, or a transport adapter with one default implementation.
  - Document ordering, delivery guarantees, concurrency, retry, and failure semantics in an ADR.
  - Remove Redis from the default stack if it has no concrete responsibility.

- [x] **P11-02 Implement outbox leasing and dispatch.**
  - Add atomic record claiming suitable for multiple worker replicas, such as `FOR UPDATE SKIP LOCKED` or equivalent leases.
  - Track attempts, claim expiration, next-attempt time, processing state, and terminal failure information.
  - Prevent duplicate concurrent processing while allowing recovery after worker crashes.

- [x] **P11-03 Compose the deployed worker around generated jobs.**
  - Add the database or queue dependencies required by the selected transport.
  - Load and route versioned event contracts to registered handlers.
  - Replace the heartbeat-only loop with real polling or queue consumption while retaining operational heartbeat metrics where useful.
  - Reject unknown event types or unsupported versions through a quarantine path.

- [x] **P11-04 Make handlers idempotent and stateful.**
  - Define idempotency keys and duplicate-delivery behavior.
  - Implement Agent Task state transitions from `queued` to `running` and `succeeded` or `failed`.
  - Make state transitions conditional so replay cannot regress completed work.
  - Persist execution metadata needed for support and audit investigation.

- [x] **P11-05 Add retry and dead-letter behavior.**
  - Use bounded exponential backoff with jitter.
  - Distinguish retryable infrastructure failures from permanent contract or business failures.
  - Add dead-letter or quarantine inspection and replay commands.
  - Document operator actions and alert thresholds.

- [ ] **P11-06 Complete worker observability and shutdown.**
  - Propagate request, actor, correlation, trace, and event identifiers into worker spans and logs.
  - Add queue depth, processing duration, retry, failure, and oldest-message-age metrics.
  - Stop claiming new work during shutdown and allow bounded draining of in-flight jobs.
  - Add readiness behavior that reflects required dependencies.

- [ ] **P11-07 Prove the workflow end to end.**
  - Add a test that creates an Agent Task through the browser or API and observes eventual terminal processing.
  - Cover two concurrent workers, duplicate delivery, retry, crash recovery, and dead-letter behavior.
  - Include the live worker in preview smoke tests and performance budgets.
  - Update `docs/reference-feature-agent-tasks.md` to match the actual identity and worker flow.

Exit criteria: a browser-created task is persisted with its outbox event, claimed by a deployed worker, processed idempotently, transitioned to a terminal state, and observable across API, database, and worker boundaries under normal and failure conditions.

## Phase 12 — Production identity, validation, and distributed controls

Goal: provide a production-capable security path while keeping providers replaceable.

- [ ] **P12-01 Add a reference OIDC access-token verifier.**
  - Support discovery and JWKS retrieval with bounded caching and key rotation.
  - Validate issuer, audience, algorithm, expiration, not-before, and clock skew.
  - Map claims to the existing principal and permission model through a configurable adapter.
  - Keep development and test verifiers behind the same interface.

- [ ] **P12-02 Add a production browser authentication adapter.**
  - Provide one documented implementation for obtaining and refreshing user credentials or sessions.
  - Keep token storage and renewal behavior explicit and testable.
  - Ensure generated projects cannot silently ship the development token adapter in production.
  - Add generator options for development-only, OIDC, session, or intentionally unauthenticated profiles.

- [ ] **P12-03 Replace process-local production rate limiting.**
  - Retain the in-memory limiter for local development and unit tests.
  - Add a distributed Redis or platform-backed implementation for multi-replica deployments.
  - Define trusted-proxy and client-IP handling.
  - Add policy keys for anonymous, authenticated, route-specific, and tenant-specific limits.
  - Test consistency across multiple API instances.

- [ ] **P12-04 Enforce generated HTTP contracts at runtime.**
  - Generate or maintain Zod schemas for request bodies, parameters, queries, headers, and responses.
  - Add Nest pipes or interceptors that parse input and return normalized field-level errors.
  - Reject unknown fields where the contract requires a closed object.
  - Reuse runtime schemas for event and webhook validation.
  - Add negative contract tests against malformed and oversized payloads.

- [ ] **P12-05 Add a production-readiness gate.**
  - Fail when development authentication, placeholder secrets, local URLs, in-memory distributed controls, or unsupported runtime versions are selected for production.
  - Verify CORS origins, HTTPS endpoints, telemetry configuration, backup ownership, and rate-limit storage.
  - Expose the gate through `pnpm production:check` and the release workflow.

- [ ] **P12-06 Expand security verification.**
  - Add integration tests for token expiry, key rotation, invalid issuer and audience, permission denial, and rate-limit behavior.
  - Update the threat model for identity, proxy trust, worker replay, and multi-tenant boundaries.
  - Document secret rotation and identity-provider outage behavior.

Exit criteria: a generated production profile authenticates real identities, enforces runtime contracts and distributed limits across replicas, and cannot pass the release gate with development-only security adapters.

## Phase 13 — Supply chain, CI scale, and documentation integrity

Goal: promote tested immutable artifacts with verifiable provenance while keeping CI fast and failures diagnosable.

- [ ] **P13-01 Add image and dependency supply-chain artifacts.**
  - Generate an SBOM for each production image.
  - Scan images and fail according to an explicit severity and exception policy.
  - Produce build provenance or attestations.
  - Sign published image digests and document verification.

- [ ] **P13-02 Promote digests instead of rebuilding releases.**
  - Publish immutable images once after validation.
  - Record image digests in the release plan.
  - Promote the same tested digests between preview and production environments.
  - Add GitHub Environment approval and least-privilege permissions for production publication or deployment.

- [ ] **P13-03 Improve CI cancellation, caching, and diagnostics.**
  - Add workflow concurrency and cancel superseded pull-request runs.
  - Add Docker BuildKit cache reuse.
  - Upload Playwright traces, screenshots, service logs, release plans, and performance reports after failures.
  - Keep deterministic local fallbacks when remote caching is unavailable.

- [ ] **P13-04 Audit Nx cache inputs and affected execution.**
  - Declare environment-sensitive inputs for builds, generated contracts, containers, and delivery tasks.
  - Verify cache invalidation for public browser environment variables and image metadata.
  - Move full-workspace typecheck and build steps to affected execution when graph coverage proves it safe.
  - Re-evaluate Nx Cloud only after collecting the documented representative CI sample.

- [ ] **P13-05 Add documentation integrity checks.**
  - Check internal links, referenced files, commands, and environment-variable names.
  - Detect stale identity and authentication descriptions.
  - Generate or validate architecture diagrams from the Nx project graph.
  - Require roadmap and ADR updates when generator output or architectural boundaries change.

- [ ] **P13-06 Validate release metadata and rollback evidence.**
  - Attach SBOMs, attestations, digests, migration plans, backup identifiers, and smoke-test results to release records.
  - Add automated checks that the rollback window and schema-compatibility decision are recorded.
  - Exercise disaster recovery and restore procedures on a scheduled basis.

Exit criteria: production uses the exact image digests validated in preview, each artifact has scan results, SBOM, provenance, and signature, CI failures retain actionable evidence, and documentation checks prevent known forms of drift.

## Phase 14 — Optional agentic application profile

Goal: offer reusable AI application capabilities without coupling ordinary generated web applications to a specific model provider or orchestration framework.

- [ ] **P14-01 Define profile boundaries in an ADR.**
  - Separate coding-agent repository support from runtime AI product capabilities.
  - Define which interfaces belong in the shared platform and which implementations remain optional.
  - Establish data classification, retention, and provider-selection constraints.

- [ ] **P14-02 Add provider-neutral model interfaces.**
  - Define chat or generation, structured-output, embedding, and streaming interfaces.
  - Implement at least two provider adapters or one provider plus a deterministic test adapter.
  - Normalize timeouts, cancellation, usage, errors, and retry behavior.

- [ ] **P14-03 Add typed tools and streaming transport.**
  - Define tools with runtime input and output schemas.
  - Add authorization at tool invocation boundaries.
  - Stream events through a versioned protocol consumed by the web profile.
  - Preserve trace, actor, conversation, model, and tool identifiers.

- [ ] **P14-04 Add prompt and evaluation lifecycle.**
  - Version prompts and tool instructions as reviewed artifacts.
  - Add deterministic fixtures and model-graded or rule-based evaluations where appropriate.
  - Track quality, latency, token use, and estimated cost budgets.
  - Require evaluation evidence for prompt, model, or tool changes.

- [ ] **P14-05 Add optional durable execution.**
  - Provide a replaceable adapter for checkpointing, resumable runs, human approval, and recovery after interruption.
  - Reuse the worker reliability, idempotency, and observability foundations from Phase 11.
  - Do not require a durable-agent framework in the default profile.

- [ ] **P14-06 Add safety and governance hooks.**
  - Add input and output policy interfaces, sensitive-data handling, tool allowlists, and audit events.
  - Define model and provider fallback policy.
  - Document prompt-injection, data-exfiltration, excessive-agency, and runaway-cost mitigations.

- [ ] **P14-07 Generate and test the AI profile.**
  - Add a preset option or generator that installs only the selected AI capabilities.
  - Add a reference workflow with streaming, one typed tool, persistence, evaluation, and observability.
  - Verify that the default non-AI profile contains no model-provider dependencies.

Exit criteria: the optional profile generates a provider-replaceable, observable, evaluated AI workflow with typed tools and explicit safety boundaries, while the base template remains free of AI runtime dependencies.

## Definition of done for roadmap tasks

A task may be marked complete only when:

- implementation and migrations are merged
- focused unit, integration, contract, and end-to-end tests pass as applicable
- generated-workspace behavior is covered when the change affects the template
- security, delivery, and operational implications are documented
- relevant ADRs, runbooks, reference-feature documentation, and this roadmap are current
- the repository and generated workspace remain clean after validation
