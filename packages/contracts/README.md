# Contracts

Universal HTTP contract artifacts shared by the API and browser applications.

## Entry points

- `@steadystack/contracts` — universal runtime validators and public schema types
- `@steadystack/contracts/server` — generated schema, operation, and success-response aliases for server presentation code
- `@steadystack/contracts/client` — generated dependency-free fetch client for browser and server consumers
- `@steadystack/contracts/openapi` — low-level generated OpenAPI `paths`, `operations`, and `components` types
- `@steadystack/contracts/openapi.json` — deterministic bundled OpenAPI document
- `@steadystack/contracts/runtime` — generated Zod schemas for HTTP request locations and responses

## Workflow

Edit only `openapi/source`, then run:

```bash
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:compat
```

Generated files are committed so pull requests show the exact client and type impact of a contract change.
The API applies each operation's runtime contract to bodies, headers, path and
query parameters, and successful responses. Closed OpenAPI objects become
strict Zod objects. Versioned event validators are maintained beside the HTTP
artifacts and reused by worker dispatch.
