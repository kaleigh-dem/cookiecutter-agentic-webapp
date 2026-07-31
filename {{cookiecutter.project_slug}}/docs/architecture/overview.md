# Architecture overview

The system begins as a TypeScript monorepo with three deployable applications: web, API, and worker. The API is a modular monolith. Business capabilities own their domain logic and data and expose narrow public interfaces.

## Principles

1. Optimize for explicit ownership and safe change.
2. Keep deployment topology simpler than code boundaries.
3. Validate all trust boundaries.
4. Generate clients from contracts instead of duplicating types.
5. Make architectural rules executable in CI.
6. Add distributed-system complexity only after evidence requires it.
