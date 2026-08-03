# ADR 0012: Enforce OpenAPI contracts with generated Zod schemas

- Status: Accepted
- Date: 2026-08-03
- Task: P12-04

## Context

Generated TypeScript types protect compile-time consumers but disappear at the
network boundary. Nest controllers could therefore receive malformed or
oversized values, silently discard unknown object fields, or return a shape that
no longer matched OpenAPI. Handwritten route validators would duplicate the
authoritative contract and drift independently.

## Decision

Generate framework-free Zod validators from the bundled OpenAPI 3.1 document in
the existing deterministic contracts generation step.

- Each component schema is exported as a Zod schema.
- Each operation exports request schemas for its body, headers, path parameters,
  and query parameters plus a schema for every documented JSON response.
- JSON Schema objects with `additionalProperties: false` become strict objects.
  Path and query parameter containers are strict; header containers remain open
  because infrastructure may add undeclared headers while declared header values
  still require validation.
- Unsupported JSON Schema constructs fail generation instead of emitting a
  permissive validator.
- A Nest interceptor applies the generated operation contract before controller
  execution and validates successful responses. Request failures use normalized,
  field-level errors; response drift fails closed without returning the invalid
  payload.
- Maintained event and future webhook schemas live in the framework-free
  contracts project, reuse applicable generated field schemas, and are imported
  by every producer and consumer.

The OpenAPI source remains authoritative for HTTP behavior. Generated runtime
files are committed and covered by the existing drift check.

## Consequences

HTTP runtime behavior, generated client types, and documentation now change from
one reviewed source. Contract generation supports the JSON Schema constructs
used by the template and intentionally stops on unsupported constructs. Adding a
new construct requires extending and testing the generator in the same change.
Route implementations must attach their generated operation contract, and
negative tests must cover malformed, oversized, and undeclared input as
applicable.
