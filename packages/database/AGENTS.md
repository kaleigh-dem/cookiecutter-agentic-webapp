# Database project guidance

- Keep domain models and repository ports outside this project; this project implements adapters.
- Do not export Drizzle table types as domain types.
- Qualify application objects with the `app` schema and migration metadata with `infra`.
- Add an explicit reversible migration for every schema change.
- Use application-generated UUIDs and UTC `timestamptz` columns.
- Put transaction boundaries in application use cases and pass the transaction-scoped database handle to repositories.
- Integration tests must own their PostgreSQL container lifecycle.
- Update `docs/TODO.md` when Phase 4 status changes.
