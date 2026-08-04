# Changelog

All notable template changes are documented in this file. Template releases follow semantic versioning and use `template-v<version>` tags.

## [Unreleased]

### Added

- A complete PostgreSQL-backed asynchronous Agent Task workflow with leased outbox claims, fenced idempotent execution, bounded retries, dead-letter inspection and replay, worker readiness, metrics, and graceful shutdown.
- A production OIDC access-token verifier with discovery, bounded JWKS caching, signing-key rotation, strict issuer and audience validation, configurable claim mapping, and fail-closed provider errors.
- Production browser authentication profiles for OIDC and application-owned sessions, including in-memory credential storage, deduplicated renewal, invalidation, and fail-closed image builds.
- PostgreSQL-backed distributed API rate limiting with authenticated, anonymous, route, and tenant policies plus explicit trusted-proxy handling.
- Generated Zod request and response validators with NestJS runtime HTTP contract enforcement.
- A production-readiness gate covering identity, local and placeholder values, HTTPS, CORS, PostgreSQL TLS, distributed controls, telemetry, runtime support, and backup ownership.
- Security integration coverage for expiry, issuer and audience mismatch, signing-key rotation, permission denial, and subject-scoped rate limiting.
- Identity and secret rotation operations, identity-provider outage guidance, and an expanded production threat model.
- Generated-workspace onboarding covering required tooling, supported profiles, first-run commands, preview validation, and explicit production replacement points.
- A generated-project checklist for repository settings, branch protection, environments, secrets, ownership, operational readiness, and ongoing template upgrades.

### Changed

- PostgreSQL outbox polling is now the only implemented baseline worker transport; Redis is no longer provisioned without an owned adapter or concrete responsibility.
- Template and initialization documentation now treat the generated-workspace flow as released and verified rather than under review.
- Generated-workspace CI verifies that downstream onboarding and governance documentation survives preset cleanup.
- Nx packages were updated to 23.1.1, Prettier to 3.9.6, and Vitest to 4.1.10.
- Repository documentation was reconciled with the current architecture, commands, release gates, operational runbooks, and completed Phase 12 roadmap state.

## [0.2.0] - 2026-08-01

### Added

- Generated-workspace end-to-end CI covering released preset installation, repository validation, database migration and seed, production preview images, smoke and performance checks, deterministic teardown, identity neutrality, and Git cleanliness.
- A downstream upgrade command with dry-run and apply modes, ordered release migrations, machine-readable file ownership, conflict guidance, and idempotent application.
- Release-artifact validation that upgrades a `0.1.0` generated-workspace fixture while preserving application-owned content.

## [0.1.0] - 2026-08-01

### Added

- Parameterized Nx initialization and structural generators.
- Identity-neutral generated workspaces with deterministic validation.
- Node 24 LTS, security, delivery, preview, and performance validation foundations.
- Versioned workspace-plugin packaging and GitHub Release automation.
