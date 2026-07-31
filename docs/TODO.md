# Delivery TODO

Last updated: 2026-07-31

This file is the maintained execution ledger for the template. Roadmap summaries may link here, but status and exit criteria live here.

## Status conventions

- `[ ]` planned
- `[-]` in progress
- `[x]` completed and verified
- `[!]` blocked; include the blocker and required decision

## Maintenance rules

1. Keep task IDs stable after they appear in a PR, issue, or ADR.
2. Update this file in every PR that changes delivery status, scope, sequencing, or exit criteria.
3. Mark an item complete only when its tests, documentation, and CI checks pass.
4. Add newly discovered work under the relevant phase instead of hiding it in PR comments.
5. Record intentional deferrals with a reason and target phase.

## Phase 2 — Nx platform migration

- [x] **P2-01** Replace the Python Cookiecutter/Turborepo scaffold with an Nx workspace template.
- [x] **P2-02** Add Next.js, NestJS, worker, shared UI, contracts, and environment projects.
- [x] **P2-03** Enforce scope, runtime, and project-type boundaries.
- [x] **P2-04** Add frozen-lockfile CI for synchronization, formatting, typechecking, builds, linting, and tests.
- [x] **P2-05** Ensure a production build leaves tracked files unchanged.

Exit criteria: a clean checkout passes `pnpm check`, and GitHub Actions verifies a clean working tree after build.

## Phase 3 — Workspace generators

- [x] **P3-01** Add the `@agentic-webapp/workspace-plugin` local Nx plugin project.
- [x] **P3-02** Add a domain generator with framework-free domain/application structure, tags, tests, and guidance.
- [x] **P3-03** Add a browser feature generator with tags, a public API, a view model test, and guidance.
- [x] **P3-04** Add a worker job generator with queue metadata, correlation handling, tests, and barrel updates.
- [x] **P3-05** Add a contract generator with a Zod runtime schema, inferred type, tests, and barrel updates.
- [x] **P3-06** Verify generator unit tests, package resolution, formatting, typechecking, and build in CI.
- [ ] **P3-07** Add a generated-output smoke test that runs all four generators in a temporary workspace and validates the resulting project graph.
- [x] **P3-08** Document extension guidance for adding a fifth generator without weakening boundaries.

Exit criteria: all four generators run by package name, generator unit tests pass, generated projects receive correct tags, and CI validates the plugin as a normal Nx project.

## Phase 4 — Data foundation

- [-] **P4-01** Record the ORM/query-layer decision in an ADR, including migration and testing tradeoffs.
- [-] **P4-02** Add the database project with Node-only and data-access tags.
- [-] **P4-03** Define schema naming, timestamps, identifiers, soft-delete policy, and transaction conventions.
- [-] **P4-04** Add migration create/apply/rollback/status commands.
- [-] **P4-05** Add deterministic development seed data and a reset command.
- [ ] **P4-06** Add repository adapters for the reference domain without leaking database types into domain projects.
- [-] **P4-07** Add isolated PostgreSQL integration tests with automatic setup and teardown.
- [-] **P4-08** Add CI migration validation against an empty database and an upgrade-from-previous-schema fixture.
- [-] **P4-09** Document backup, restore, and destructive migration review requirements.

Current increment: PR #4 builds the shared database platform. P4-06 remains sequenced after the reference domain is selected so adapters implement a real domain port rather than a placeholder abstraction.

Exit criteria: migrations are reproducible, repository integration tests run in CI, and domain projects remain database-framework-free.

## Phase 5 — API contracts and generated clients

- [ ] **P5-01** Define the OpenAPI source-of-truth and ownership model.
- [ ] **P5-02** Add API document generation and deterministic bundling.
- [ ] **P5-03** Generate server-side operation and schema types.
- [ ] **P5-04** Generate a browser-safe typed client.
- [ ] **P5-05** Add contract drift and backward-compatibility checks.
- [ ] **P5-06** Add versioning and deprecation guidance for HTTP and event contracts.
- [ ] **P5-07** Prevent handwritten duplicate API types in web features.

Exit criteria: generated artifacts are reproducible, drift fails CI, and the web application consumes the generated client.

## Phase 6 — Vertical reference feature

- [ ] **P6-01** Select a representative domain workflow with create, read, validation, and authorization behavior.
- [ ] **P6-02** Generate the domain, feature, contract, and any worker job through Phase 3 generators.
- [ ] **P6-03** Implement the NestJS presentation and composition adapters.
- [ ] **P6-04** Implement persistence and migration support.
- [ ] **P6-05** Implement the Next.js route and feature states.
- [ ] **P6-06** Add unit, integration, contract, and Playwright tests.
- [ ] **P6-07** Add trace propagation from browser request through API, database, and job execution.
- [ ] **P6-08** Document the feature as the canonical example for agents and contributors.

Exit criteria: one workflow proves the intended architecture from UI to database and is covered at every important boundary.

## Phase 7 — Observability and operations

- [ ] **P7-01** Add structured logging with redaction and stable event names.
- [ ] **P7-02** Add OpenTelemetry initialization for web, API, and worker runtimes.
- [ ] **P7-03** Propagate request, trace, user, and job correlation identifiers.
- [ ] **P7-04** Add liveness, readiness, and dependency health checks.
- [ ] **P7-05** Add baseline metrics and service-level indicators.
- [ ] **P7-06** Add local telemetry infrastructure or an exporter-neutral development path.
- [ ] **P7-07** Add runbooks for common failures and degraded dependencies.

Exit criteria: the reference feature can be followed across services without exposing sensitive data.

## Phase 8 — Authentication and security

- [ ] **P8-01** Record the identity-provider and session/token architecture decision.
- [ ] **P8-02** Add authentication adapters for web and API.
- [ ] **P8-03** Add authorization policy boundaries and test helpers.
- [ ] **P8-04** Add secure HTTP defaults, rate limiting, validation, and error normalization.
- [ ] **P8-05** Add dependency, license, secret, and static-analysis checks.
- [ ] **P8-06** Add `SECURITY.md`, vulnerability reporting, and threat-model guidance.
- [ ] **P8-07** Add audit-event conventions for security-sensitive actions.

Exit criteria: protected reference-feature behavior has automated authorization tests and CI security gates.

## Phase 9 — Delivery, performance, and scale

- [ ] **P9-01** Add production container targets and minimal runtime images.
- [ ] **P9-02** Add environment-specific deployment examples and configuration validation.
- [ ] **P9-03** Add release/versioning and migration-order automation.
- [ ] **P9-04** Add baseline load tests and performance budgets.
- [ ] **P9-05** Add preview-environment guidance and smoke tests.
- [ ] **P9-06** Evaluate Nx Cloud using measured CI duration and team-concurrency thresholds.
- [ ] **P9-07** Add disaster-recovery and rollback runbooks.

Exit criteria: releases are repeatable, observable, reversible, and measured against explicit performance budgets.
