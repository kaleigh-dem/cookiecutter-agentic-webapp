# Distributed API rate limiting

Production API replicas share fixed-window counters through PostgreSQL. Local development and unit tests use a bounded in-memory implementation behind the same `RateLimitStore` port.

## Configuration

```dotenv
API_RATE_LIMIT_STORE=postgres
API_RATE_LIMIT_ANONYMOUS_MAX=60
API_RATE_LIMIT_AUTHENTICATED_MAX=120
API_RATE_LIMIT_ROUTE_MAX=60
API_RATE_LIMIT_TENANT_MAX=1000
API_RATE_LIMIT_WINDOW_MS=60000
API_TRUSTED_PROXY_HOPS=1
AUTH_OIDC_TENANT_CLAIM=tenant_id
```

Production rejects `API_RATE_LIMIT_STORE=memory`. Development may select `memory` and bound identity churn with `API_RATE_LIMIT_MAX_BUCKETS`.

Every non-exempt request consumes a global identity policy and a route policy. Authenticated principals use the verified subject; other requests use the client address resolved by Express. A verified tenant claim adds a tenant-wide policy. Stored keys contain SHA-256 digests rather than raw identity, route, tenant, or address values.

The first exceeded policy returns `429`, `Retry-After`, and `X-Rate-Limit-Policy`. PostgreSQL errors return `503 rate_limit_unavailable`; replicas do not silently fall back to independent memory counters.

## Trusted proxies

`API_TRUSTED_PROXY_HOPS=0` ignores forwarded client addresses. Set a non-zero hop count only when every request reaches the API through a fixed, trusted ingress chain and the configured number matches its shortest path. Do not copy a production example without verifying the deployment topology. Variable paths require an allowlisted proxy function rather than a hop count.

## Operations

The `app.rate_limit_windows` table is created by the normal migration lifecycle. Counters reset in place after their window expires, and adapters periodically delete old rows in bounded batches. Monitor PostgreSQL availability, `429` responses by policy, and `503 rate_limit_unavailable` responses. Threshold changes are configuration changes and should be validated under representative traffic before rollout.

The integration suite opens two independent database pools and proves they enforce one shared counter. Preview smoke and generated-workspace validation apply the migration through the existing deployment lifecycle.
