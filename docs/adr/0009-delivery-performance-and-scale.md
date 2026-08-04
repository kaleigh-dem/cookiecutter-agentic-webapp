# ADR 0009: Delivery, performance, and scale baseline

- Status: Accepted
- Date: 2026-08-01

## Context

The workspace has application, data, observability, and security foundations, but a release still needs a repeatable path from source to runtime. The template must remain provider-neutral while giving adopters executable defaults for images, configuration, migrations, preview validation, performance budgets, rollback, and future CI scaling.

## Decision

1. Package web, API, and worker as OCI images through Nx `container` targets.
   - API and worker use multi-stage Node images with production-only dependencies and a non-root runtime user.
   - Web uses Next.js standalone output and a non-root runtime user.
   - Images carry version and revision OCI labels.
2. Keep deployment configuration outside images.
   - Checked-in environment examples describe required keys.
   - `pnpm production:check` invokes `tools/delivery/production-check.mjs` and rejects missing, malformed, insecure, placeholder, local, or development-only production configuration.
   - Public browser values are intentionally build-time inputs; secrets are never build arguments.
3. Use immutable semantic versions for release images. A release plan orders work as:
   - validate configuration;
   - capture a database backup;
   - inspect pending migrations;
   - apply migrations;
   - deploy services;
   - run smoke checks;
   - observe release indicators for the rollback window.
4. Validate the production artifacts in an ephemeral Compose preview. The preview starts dependencies, applies migrations, boots the images, runs security-aware smoke checks, and enforces explicit P95/error-rate budgets.
5. Treat performance budgets as versioned code. Budget changes require review and an explanation of the measured tradeoff.
6. Defer Nx Cloud until measured CI or collaboration load crosses an adoption threshold. Re-evaluate when median CI reaches 600 seconds, P95 reaches 900 seconds, or peak concurrent pull requests reach three.
7. Prefer roll-forward database corrections after migrations are applied. Application images may be rolled back only when their data contract remains compatible. Destructive recovery requires a verified backup and the disaster-recovery runbook.

## Consequences

- Delivery behavior is executable and reviewable without selecting a specific hosting provider.
- Container builds are slower than local compilation, so they run in a dedicated Delivery workflow.
- Preview validation uses the same images and migration commands as a release, reducing environment drift.
- Adopters must provide a secret manager, ingress/TLS, managed data services, image retention, and backup implementation appropriate to their platform.
- Nx Cloud is not adopted speculatively; the decision can change when the checked-in measurements cross the thresholds.
