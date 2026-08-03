# ADR 0003: OpenAPI contract ownership and generation

- Status: Accepted
- Date: 2026-07-31
- Tasks: P5-01, P5-02, P5-03, P5-04, P5-05

## Context

The API, browser application, integration tests, and future agents need one authoritative description of HTTP behavior. Handwritten request and response interfaces drift from controllers, duplicate names across projects, and cannot support automated compatibility review.

The workspace also needs generated artifacts that are deterministic, reviewable, and usable without adding Node-only code to the browser bundle.

## Decision

The canonical HTTP contract is the OpenAPI 3.1 source under `packages/contracts/openapi/source`.

- API owners change the OpenAPI source in the same pull request as the implementing controller or adapter.
- Reusable schemas live under `openapi/source/schemas` and are referenced from the root document.
- The generation script resolves repository-local external references, sorts object keys, emits a bundled OpenAPI document, and invokes the pinned `openapi-typescript` generator.
- Generated files under `openapi/generated` and `src/generated` are committed for review and package consumption. They are never edited directly.
- NestJS presentation code imports operation and response types from `@agentic-webapp/contracts/server`.
- Browser code imports the dependency-free fetch client from `@agentic-webapp/contracts/client`.
- Runtime validation that is not expressible through TypeScript remains handwritten, but its type predicates narrow to generated schema types rather than declaring duplicate interfaces.

ADR 0012 extends this decision by generating framework-free Zod validators for
HTTP schemas and operations; maintained event and webhook validators remain in
the contracts project.

## Compatibility baseline

`packages/contracts/openapi/baseline/openapi.json` represents the latest reviewed compatibility boundary. CI compares the generated bundle with that baseline and rejects removal of existing paths, methods, parameters, response codes, component schemas, properties, and enum values, as well as newly required inputs.

The baseline is updated only when reviewers intentionally accept the compatibility impact. Updating the baseline is not a way to hide an accidental breaking change.

## Versioning

- Additive changes remain within the current API major version.
- Breaking HTTP changes require a new versioned path or an explicitly approved coordinated migration.
- Every operation has a stable `operationId`; renaming it is treated as breaking because generated client method names depend on it.
- Deprecated operations and fields use the OpenAPI `deprecated` marker and include replacement guidance before removal.
- Event contracts remain separately versioned because delivery semantics and compatibility rules differ from HTTP APIs.

## Consequences

- Contract changes become visible before implementation details.
- The API and web projects share generated types without importing each other.
- Browser consumers receive a small fetch-based client with no Node runtime dependency.
- CI generation adds work to contract changes, but drift and compatibility failures are detected before merge.
- Phase 6 can implement a vertical feature against stable generated interfaces.
