# Web application instructions

- Keep `src/app` focused on routing, layouts, metadata, and composition.
- Put business-facing UI behavior under `src/features/<feature>`.
- Prefer server components; introduce client components only at interaction boundaries.
- Consume API types and clients from `packages/contracts`.
- Do not access the database or server-only secrets from the web application.
