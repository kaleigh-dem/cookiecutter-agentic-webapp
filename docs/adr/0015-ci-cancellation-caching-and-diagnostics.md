# ADR 0015: CI cancellation, caching, and failure diagnostics

- Status: Accepted
- Date: 2026-08-05

## Context

The required pull-request workflows run independent CI, delivery, security, and generated-workspace validation. Before this decision, most workflows continued after a newer commit superseded them, production image targets invoked uncached `docker build`, and failure evidence was split between console output and ephemeral runner directories. The result was unnecessary runner consumption and failures that were harder to reproduce or diagnose.

The repository must remain usable without a hosted cache service. Local and generated workspaces also need the same image-build command as CI, and a cache outage must not change image contents or block validation.

## Decision

1. CI, Delivery, Security, and Generated workspace use a concurrency group keyed by workflow and pull-request number. They cancel superseded pull-request runs, but do not cancel `main`, scheduled, or manually dispatched runs.
2. Production container targets use `docker buildx build --load` through `tools/delivery/build-container.mjs`.
   - Local execution is uncached by default and remains the deterministic fallback for Docker installations that use the default driver.
   - Cache-capable CI jobs install the Docker container Buildx driver and explicitly set `BUILDKIT_CACHE_ENABLED=true`.
   - Every service uses a separate local BuildKit cache scope.
   - An enabled build imports the current cache only when it exists and exports to a separate next directory before atomically replacing the current cache.
   - The cache root defaults to `.cache/buildkit` when caching is enabled.
3. Delivery and generated-workspace CI persist `.cache/buildkit` with the official GitHub cache action. Cache restore failures are non-blocking, so an unavailable remote cache produces a normal build with an empty local cache rather than a different Dockerfile, target, or build input.
4. Playwright retains traces, screenshots, video, and an HTML report only when useful for failures.
5. CI failure artifacts use stable diagnostic directories and retain, when produced:
   - Playwright results and reports;
   - preview service logs;
   - JSON performance results;
   - generated-workspace diagnostics;
   - the CI release plan.
6. Diagnostic uploads run only after failure and use bounded retention. They must not expose production secrets; workflows continue to use local preview configuration and release plans containing public metadata only.

## Consequences

- New commits stop obsolete pull-request validation while protected branch and scheduled runs remain complete.
- Warm Docker layers can be reused across CI runs, while the same container target remains usable with the uncached local fallback.
- The cache is an optimization only. Disabling it or deleting `.cache/buildkit` must not change the image produced from the same source and build arguments.
- Failures retain enough evidence for browser, service, performance, generated-workspace, and release-plan investigation.
- Cache-input completeness for all Nx and environment-sensitive tasks remains P13-04; this decision does not introduce Nx Cloud or broaden affected execution.
