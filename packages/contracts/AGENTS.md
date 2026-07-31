# Contract project guidance

- Treat `openapi/source` as the authoritative HTTP contract.
- Never edit files under `openapi/generated` or `src/generated` directly.
- Give every operation a stable TypeScript-safe `operationId`.
- Reuse component schemas and avoid duplicate request or response interfaces in consumers.
- Keep generated client code browser-safe and free of Node-only imports.
- Import generated server aliases only at presentation and adapter boundaries; domain projects stay transport-independent.
- Run generation, drift, compatibility, lint, typecheck, and tests for every contract change.
- Update the compatibility baseline only after reviewers intentionally accept the new boundary.
- Document deprecations and replacement operations before removal.
