# Rate limiting

Framework-free rate-limit policy construction and the `RateLimitStore` port. The API composes this boundary with an in-memory development adapter or the PostgreSQL adapter exported by `@agentic-webapp/database`.

## Policy model

Each non-exempt request may consume:

- an anonymous client-address or authenticated-subject policy
- a per-client, per-method, per-route policy
- a tenant-wide policy when a verified principal contains the configured tenant claim

Raw subjects, tenants, routes, and client addresses are hashed before becoming storage keys. A storage error is surfaced as `rate_limit_unavailable`; production does not fall back to process-local counters.

## Adapter boundary

- this project owns policy keys, limits, decisions, and the storage interface
- `packages/database` owns the PostgreSQL fixed-window implementation
- `apps/api` owns NestJS guard composition, trusted-proxy configuration, and HTTP responses

## Validation

```bash
pnpm nx run backend-rate-limit:test
pnpm nx run backend-rate-limit:typecheck
pnpm nx run backend-rate-limit:build
```

See `docs/rate-limiting.md` and ADR 0011 for configuration, proxy trust, multi-replica behavior, and operations.
