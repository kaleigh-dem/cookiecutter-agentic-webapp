# API contract workflow

## Source of truth

Edit `packages/contracts/openapi/source/openapi.json` and the referenced files under `packages/contracts/openapi/source/schemas`.

Do not edit these generated files directly:

- `packages/contracts/openapi/generated/openapi.json`
- `packages/contracts/src/generated/openapi.ts`
- `packages/contracts/src/generated/server.ts`
- `packages/contracts/src/generated/client.ts`
- `packages/contracts/src/generated/runtime.ts`

## Commands

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:compat
```

`contracts:generate` resolves repository-local JSON references, emits a deterministic bundled OpenAPI document, generates OpenAPI TypeScript definitions and server aliases, generates the browser-safe fetch client, and translates supported OpenAPI 3.1 JSON Schemas into framework-free Zod request and response validators.

`contracts:check` regenerates the artifacts and fails when the working tree changes. This is the drift check used by CI.

`contracts:compat` compares the generated bundle with `openapi/baseline/openapi.json` and rejects common backward-incompatible changes.

## Adding an operation

1. Add the path and method to the OpenAPI source.
2. Give the operation a stable TypeScript-safe `operationId`.
3. Reuse component schemas instead of defining duplicate request or response shapes.
4. Run contract generation.
5. Implement the NestJS presentation boundary using types from `@steadystack/contracts/server`.
6. Apply the operation contract from `@steadystack/contracts/runtime` at the Nest route boundary.
7. Call the operation from browser code through `@steadystack/contracts/client`.
8. Add positive and negative API, client, and compatibility tests.
9. Update the compatibility baseline only after the new contract has been reviewed.

## Runtime enforcement

`HttpContractInterceptor` validates request bodies, headers, path parameters,
and query parameters before a controller executes. It rejects undeclared fields
for schemas with `additionalProperties: false` and returns normalized
`validation_failed` responses with a location, path, code, and safe message for
each invalid field. Successful handler results are checked against the declared
status response and fail closed as an internal error if the implementation
drifts from OpenAPI.

HTTP headers remain open because intermediaries and infrastructure add headers;
declared headers are still validated. Path and query objects are closed. Nest's
JSON parser retains its transport-level payload limit, while field sizes such as
the Agent Task 4,000-character prompt limit are enforced by the generated
schema.

Versioned event contracts remain maintained Zod schemas under
`packages/contracts/src` because event compatibility and delivery semantics are
separate from OpenAPI. They reuse relevant generated field schemas, and
producers and worker dispatch import the same strict event schema. Future
webhook adapters must likewise consume an exported contracts schema rather than
define a transport-local validator.

## Evolution rules

Prefer additive changes:

- add optional request fields
- add response fields without removing existing fields
- add new response codes without removing documented codes
- add new enum values instead of renaming existing values
- introduce a replacement operation before deprecating the old operation

Treat these as breaking:

- removing or renaming a path, method, parameter, property, response code, schema, enum value, or `operationId`
- adding a required parameter or required request body
- narrowing a schema type
- changing an existing value's meaning

Mark deprecated operations and fields with `deprecated: true`, document their replacement, and keep them available for an agreed migration window. Breaking changes require an explicitly versioned API surface or a coordinated migration approved in the pull request.

## Consumer boundaries

- API controllers and adapters may import `@steadystack/contracts/server` and `@steadystack/contracts/runtime`.
- Browser features may import `@steadystack/contracts/client` and universal runtime validators from `@steadystack/contracts`.
- Browser features must not declare local request or response interfaces that duplicate the OpenAPI source.
- Contracts must not import API, web, worker, database, or framework projects.
