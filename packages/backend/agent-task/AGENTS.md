# AgentTask domain guidance

- Keep domain and application code framework-free.
- Expose cross-project behavior through `src/index.ts` only.
- Define persistence ports here; keep PostgreSQL and Drizzle adapters in `packages/database`.
- Keep transactional outbox creation inside the application use case and persistence boundary without importing delivery infrastructure.
- Make execution transitions conditional, monotonic, and safe under duplicate or stale delivery.
- Test invariants and use cases without network or database dependencies.
