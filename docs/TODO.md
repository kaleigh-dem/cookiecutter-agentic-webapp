# Template Roadmap

Last updated: 2026-08-08

This file tracks active work required to evolve the repository as a reusable, upgradeable application platform. Completed implementation history remains available in merged pull requests, ADRs, and Git history instead of being repeated as a separate historical roadmap.

## Completed baseline

Phases 2–12 established the current foundation:

- Nx workspace migration and enforceable project boundaries
- architecture-aware domain, feature, job, and contract generators
- deterministic template initialization, releases, generated-workspace validation, and downstream upgrades
- PostgreSQL migrations, integration tests, repositories, transactional outbox delivery, and distributed rate limits
- deterministic OpenAPI generation, browser clients, and runtime HTTP contract enforcement
- a complete asynchronous Agent Tasks reference feature
- structured logging, OpenTelemetry, health checks, worker metrics, and runbooks
- development and production browser authentication profiles plus OIDC access-token verification
- production images, preview validation, production-readiness checks, release planning, and performance budgets
- security verification for token expiry, issuer and audience mismatch, signing-key rotation, permission denial, and rate-limit behavior

Detailed completed-phase task lists are intentionally omitted. Relevant implementation evidence remains recorded in merged PRs #2–#49, `docs/adr/`, and Git history.

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
7. After a phase is fully completed and verified, replace its detailed task list with a concise baseline summary; retain the detailed record in merged PRs, ADRs, and Git history.

## Execution order

1. Phase 13 is active; P13-01 through P13-06 are complete, and no additional Phase 13 implementation is planned.
2. Phase 14 is optional; P14-01 through P14-04 are complete, P14-05 is next, and the default workspace profile must remain free of AI runtime dependencies.

## Phase 13 — Supply chain, CI scale, and documentation integrity

Goal: promote tested immutable artifacts with verifiable provenance while keeping CI fast and failures diagnosable.

Phase 13 progress record (2026-08-07): P13-01 is completed in reviewed PR #50 and squash commit `d4766a30d2e39f308a830ce4c6099edfe3ed045c`. P13-02 is completed in PR #52 and was hardened in PR #53. P13-03 is completed in PR #55 and merge commit `fe8a8644458803ca35d35e4262ccd39a9b02e825`; it adds pull-request cancellation, optional persisted BuildKit caches with deterministic local fallback, and retained failure diagnostics. P13-04 audits environment, Docker, generator, contract, and delivery cache inputs; adds deterministic invalidation fixtures; records a representative CI sample; moves required typecheck and build to affected execution; and retains explicit generator and generated-workspace coverage. P13-05 adds fail-closed documentation checks for links, paths, commands, environment names, identity and authentication descriptions, a generated Nx project-graph diagram, and roadmap-plus-ADR evidence for generator or boundary changes. P13-06 adds tamper-evident release records that bind immutable digests to SBOM and attestation verification, migration plans, backup identifiers, rollback-window and schema-compatibility decisions, and deployed smoke evidence; it also adds a quarterly isolated PostgreSQL restore exercise with retained recovery evidence.

- [x] **P13-01 Add image and dependency supply-chain artifacts.**
  - Generate an SBOM for each production image.
  - Scan images and fail according to an explicit severity and exception policy.
  - Produce build provenance or attestations.
  - Sign published image digests and document verification.

- [x] **P13-02 Promote digests instead of rebuilding releases.**
  - Publish immutable images once after validation.
  - Record image digests in the release plan.
  - Promote the same tested digests between preview and production environments.
  - Add GitHub Environment approval and least-privilege permissions for production publication or deployment.

- [x] **P13-03 Improve CI cancellation, caching, and diagnostics.**
  - Add workflow concurrency and cancel superseded pull-request runs.
  - Add Docker BuildKit cache reuse.
  - Upload Playwright traces, screenshots, service logs, release plans, and performance reports after failures.
  - Keep deterministic local fallbacks when remote caching is unavailable.

- [x] **P13-04 Audit Nx cache inputs and affected execution.**
  - Declare environment-sensitive inputs for builds, generated contracts, containers, and delivery tasks.
  - Verify cache invalidation for public browser environment variables and image metadata.
  - Add fixtures proving that relevant environment, configuration, Docker, generator, and contract changes invalidate every required target while unrelated changes do not.
  - Record a representative CI baseline and verify that affected execution preserves required-check and generated-workspace coverage before replacing full-workspace steps.
  - Move full-workspace typecheck and build steps to affected execution when graph coverage proves it safe.
  - Re-evaluate Nx Cloud only after collecting the documented representative CI sample.

- [x] **P13-05 Add documentation integrity checks.**
  - Check internal links, referenced files, commands, and environment-variable names.
  - Detect stale identity and authentication descriptions.
  - Generate or validate architecture diagrams from the Nx project graph.
  - Require roadmap and ADR updates when generator output or architectural boundaries change.

- [x] **P13-06 Validate release metadata and rollback evidence.**
  - Attach SBOMs, attestations, digests, migration plans, backup identifiers, and smoke-test results to release records.
  - Add automated checks that the rollback window and schema-compatibility decision are recorded.
  - Exercise disaster recovery and restore procedures on a scheduled basis.

Exit criteria: production uses the exact image digests validated in preview, each artifact has scan results, SBOM, provenance, and signature, finalized production releases retain validated backup, migration, rollback, schema-compatibility, and smoke evidence, scheduled restore exercises prove the baseline recovery path, CI failures retain actionable evidence, and documentation checks prevent known forms of drift.

## Phase 14 — Optional agentic application profile

Goal: offer reusable AI application capabilities without coupling ordinary generated web applications to a specific model provider or orchestration framework.

Phase 14 progress record (2026-08-08): P14-01 is completed by ADR 0020. It separates coding-agent repository support from runtime AI product capabilities, keeps provider-neutral contracts distinct from optional provider adapters, preserves `ai=false` as the default profile, and establishes fail-closed data-classification, explicit-retention, and server-side provider-selection constraints. P14-02 adds the backend `ModelClient` boundary for generation, JSON-Schema structured output, embeddings, and streaming; normalizes usage, cancellation, timeouts, errors, and bounded retries; and supplies an OpenAI native-fetch adapter plus a deterministic no-network adapter without adding a provider SDK dependency or wiring model calls into the default applications. P14-03 adds runtime-validated typed tools with mandatory invocation-time authorization, a strict V1 NDJSON agent-stream contract consumed by the web feature, and identifier-preserving browser decoding without composing AI runtime behavior into the default applications. P14-04 adds reviewed versioned prompt and tool-instruction artifacts, deterministic rule/model-grader evaluation boundaries, quality/latency/token/cost budgets, and a CI-enforced evidence manifest requirement for governed prompt, model, and tool changes without composing runtime AI into the default applications. P14-05 is next.

- [x] **P14-01 Define profile boundaries in an ADR.**
  - Separate coding-agent repository support from runtime AI product capabilities.
  - Define which interfaces belong in the shared platform and which implementations remain optional.
  - Establish data classification, retention, and provider-selection constraints.

- [x] **P14-02 Add provider-neutral model interfaces.**
  - Define chat or generation, structured-output, embedding, and streaming interfaces.
  - Implement at least two provider adapters or one provider plus a deterministic test adapter.
  - Normalize timeouts, cancellation, usage, errors, and retry behavior.

- [x] **P14-03 Add typed tools and streaming transport.**
  - Define tools with runtime input and output schemas.
  - Add authorization at tool invocation boundaries.
  - Stream events through a versioned protocol consumed by the web profile.
  - Preserve trace, actor, conversation, model, and tool identifiers.

- [x] **P14-04 Add prompt and evaluation lifecycle.**
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
