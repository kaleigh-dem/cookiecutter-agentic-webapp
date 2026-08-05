# ADR 0016: Nx cache inputs and affected execution

- Status: accepted
- Date: 2026-08-05
- Roadmap: P13-04

## Context

Required CI already calculated trustworthy Nx base and head SHAs, but full-workspace typecheck and build ignored that graph. Cache declarations also omitted browser build variables, image metadata, Dockerfiles, generator inputs, contract generation inputs, and delivery configuration. A stale cache entry in any of those areas could produce an artifact that did not match the reviewed inputs.

Generated workspace coverage cannot be inferred solely from application-project dependencies. The repository therefore needs both affected project execution and explicit lifecycle validation.

## Decision

Declare named inputs for browser environment, image metadata, common container files, contract generation, workspace generation, and delivery configuration. Add target-specific Dockerfile and image-variable inputs to each container target. Keep container, generated-output verification, initialization verification, and generated-contract cleanliness checks non-cacheable where replay would hide side effects or checkout mutations.

Replace required-CI full-workspace typecheck and build with one affected invocation after `nx-set-shas`. Retain explicit generator smoke targets, the path-filtered generated-workspace workflow, and the full-workspace non-blocking Node 26 compatibility job.

Check the policy with a deterministic fixture audit that includes positive invalidation cases, negative unrelated-change cases, and CI coverage assertions. Record a successful pull-request CI sample before re-evaluating Nx Cloud.

## Consequences

Required CI can skip typecheck and build work outside the affected dependency graph. Browser environment and image metadata changes cannot reuse stale outputs. Shared node-service Dockerfile changes invalidate both API and worker images, while web-only Docker and environment changes remain scoped to web targets.

The declarations are intentionally conservative for delivery checks because those checks are inexpensive and share cross-cutting release inputs. Any future narrowing must add audit fixtures that demonstrate both required invalidation and unrelated non-invalidation.

Nx Cloud remains deferred. The representative P13-04 sample is well below the adoption thresholds and does not replace the larger sample required before a remote-cache trial.
