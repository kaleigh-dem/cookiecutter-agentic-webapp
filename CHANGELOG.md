# Changelog

All notable template changes are documented in this file. Template releases follow semantic versioning and use `template-v<version>` tags.

## [Unreleased]

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
