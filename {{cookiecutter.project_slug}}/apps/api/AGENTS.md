# API instructions

- Organize business capabilities under `src/modules`.
- Keep controllers thin and move workflows into application services.
- Domain code must not import NestJS, database clients, or transport types.
- A module may expose only its `public-api.ts`, contracts, and published events.
- Do not query tables owned by another module.
