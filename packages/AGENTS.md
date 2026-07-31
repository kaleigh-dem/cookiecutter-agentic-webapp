# Shared package instructions

- A package is an Nx ownership boundary, not a dumping ground.
- Add `scope:*`, `type:*`, and `runtime:*` tags before adding code.
- Export only deliberate public APIs from `src/index.ts`.
- Do not reach into another package's internal files.
- Keep contracts framework-free and configuration packages runtime-specific.
- Validate the package and its dependents with `pnpm nx affected -t lint typecheck test build`.
