# API application instructions

- Controllers translate transport input and output; business logic belongs in generated domain libraries.
- Do not place persistence models or repositories in the application project.
- Import other backend capabilities through public library entry points only.
- Public request and response shapes belong in `packages/contracts`.
- Validate changes with `pnpm nx run api:typecheck` and `pnpm nx run api:build`.
