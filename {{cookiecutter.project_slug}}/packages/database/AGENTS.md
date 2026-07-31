# Database instructions

- Migrations are append-only after merge.
- Every table has a documented owning business module.
- Prefer additive, backward-compatible rollout steps.
- Destructive changes require a staged migration and rollback plan.
- Application modules depend on repository ports, not database client types.
