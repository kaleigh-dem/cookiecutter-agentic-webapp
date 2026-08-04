# Database project guidance

- Keep domain models and repository ports outside this project; this project implements PostgreSQL adapters.
- Do not export Drizzle table types as domain types.
- Qualify application objects with the `app` schema and migration metadata with `infra`.
- Add an explicit reversible migration for every schema change.
- Use application-generated UUIDs and UTC `timestamptz` columns.
- Put transaction boundaries in application use cases and pass transaction-scoped database handles to repositories.
- Preserve outbox leasing, ownership-token fencing, retry, replay, and rate-limit atomicity when changing adapters.
- Integration tests must own their PostgreSQL container lifecycle and use the supported PostgreSQL major version.
- Update `docs/TODO.md` when a change affects roadmap status, sequencing, scope, or exit criteria.
