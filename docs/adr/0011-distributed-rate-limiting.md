# ADR 0011: Distributed rate limiting and client identity

- Status: Accepted
- Date: 2026-08-03

## Context

The API currently stores fixed-window counters in each process. Multiple replicas therefore enforce different limits, restarts clear counters, authenticated requests are limited before authentication attaches a principal, and proxy headers have no explicit trust policy. Production needs consistent distributed enforcement without adding an otherwise-unused infrastructure service to the generated baseline.

## Decision

Use PostgreSQL as the baseline distributed rate-limit store. The API updates each fixed-window row through an atomic `INSERT ... ON CONFLICT ... DO UPDATE` statement inside one transaction. Independent API pools therefore share the same counters. Expired windows are reused and periodically deleted in bounded batches. Raw subjects, tenant identifiers, routes, and client addresses are hashed before they become storage keys.

The framework-free `backend-rate-limit` project owns policy construction and the storage port. `database` implements the PostgreSQL adapter. Development and unit tests retain a bounded in-memory adapter; production rejects that adapter and defaults to PostgreSQL.

Authentication runs before rate limiting. Each request consumes:

- an anonymous client-address or authenticated-subject policy;
- a per-client, per-method, per-route policy; and
- a tenant-wide policy when the verified principal contains the configured tenant claim.

Limits share a configurable fixed-window duration but have separate thresholds. A storage failure fails closed with `503 rate_limit_unavailable` rather than silently bypassing the control.

Express proxy trust is configured only through `API_TRUSTED_PROXY_HOPS`, from zero through ten. Zero ignores forwarded addresses. A non-zero value must match the shortest trusted ingress path; deployments with variable or untrusted paths must replace the hop-count setting with an allowlisted proxy function before rollout. Application code never parses `X-Forwarded-For` directly.

## Consequences

- The generated baseline gains multi-replica consistency without making Redis mandatory.
- Rate-limit availability now depends on PostgreSQL, which is already a required API dependency.
- Tenant limiting requires an authenticated, provider-mapped tenant claim; unverified tenant headers are ignored.
- Fixed windows permit a boundary burst. A token-bucket or managed platform adapter may replace the store port when a deployment requires smoother enforcement.
- Redis remains optional and should be introduced only with explicit availability, TLS, authentication, eviction, backup, and operations ownership.
