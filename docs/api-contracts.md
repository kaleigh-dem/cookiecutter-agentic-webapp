# API contract workflow

## Source of truth

Edit `packages/contracts/openapi/source/openapi.json` and the referenced files under `packages/contracts/openapi/source/schemas`.

Do not edit these generated files directly:

- `packages/contracts/openapi/generated/openapi.json`
- `packages/contracts/src/generated/openapi.ts`
- `packages/contracts/src/generated/server.ts`
- `packages/contracts/src/generated/client.ts`

## Commands

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:compat
```

`contracts:generate` resolves repository-local JSON references, emits a deterministic bundled OpenAPI document, generates runtime-free OpenAPI TypeScript definitions, generates server aliases, and generates the browser-safe fetch client.

`contracts:check` regenerates the artifacts and fails when the working tree changes. This is the drift check used by CI.

`contracts:compat` compares the generated bundle with `openapi/baseline/openapi.json` and rejects common backward-incompatible changes.

## Adding an operation

1. Add the path and method to the OpenAPI source.
2. Give the operation a stable TypeScript-safe `operationId`.
3. Reuse component schemas instead of defining duplicate request or response shapes.
4. Run contract generation.
5. Implement the NestJS presentation boundary using types from `@agentic-webapp/contracts/server`.
6. Call the operation from browser code through `@agentic-webapp/contracts/client`.
7. Add API, client, and compatibility tests.
8. Update the compatibility baseline only after the new contract has been reviewed.

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

- API controllers and adapters may import `@agentic-webapp/contracts/server`.
- Browser features may import `@agentic-webapp/contracts/client` and universal runtime validators from `@agentic-webapp/contracts`.
- Browser features must not declare local request or response interfaces that duplicate the OpenAPI source.
- Contracts must not import API, web, worker, database, or framework projects.
