# Threat model guidance

This document defines the baseline security model for applications generated from this template. Every production application must extend it with application-specific assets, actors, data classifications, and abuse cases.

## Assets

- user identities, sessions, access tokens, and signing keys
- agent prompts, task inputs, generated outputs, and tool results
- database records, job payloads, and outbox events
- deployment credentials and third-party API secrets
- audit records, traces, request identifiers, and operational telemetry
- tenant identifiers, ownership metadata, and authorization decisions
- trusted-proxy topology, forwarded client identity, and rate-limit state

## Trust boundaries

1. **Browser to web application** — untrusted user input enters the application and browser-held credentials or sessions are attached.
2. **Web application to API** — bearer credentials and correlation identifiers cross an HTTP boundary.
3. **Identity provider to API** — discovery metadata, JWKS documents, signing-key rotation, issuer and audience claims determine whether an external identity becomes an application principal.
4. **Ingress proxy to API** — connection metadata and forwarded addresses cross a deployment-specific trust boundary used by client identity and rate limiting.
5. **API to database and queue** — authorized application actions become durable state and asynchronous work.
6. **API to worker replay** — actor, tenant, correlation, contract version, and idempotency context must survive retries and operator replay without being replaced by untrusted payload data.
7. **Tenant to shared platform services** — storage, limits, logs, events, and caches are shared infrastructure but must remain scoped by verified tenant and ownership context.
8. **Worker to external tools** — agent-controlled or model-derived inputs may reach third-party systems.
9. **CI to deployment environments** — repository content and dependencies can influence privileged automation.

## Baseline threats and controls

| Threat                                         | Baseline controls                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity spoofing                              | Provider-issued bearer tokens, exact issuer and audience validation, allowlisted algorithms, bounded clock skew, adapter-level verification, production rejection of development tokens              |
| Identity-provider metadata or key substitution | HTTPS discovery and JWKS, exact discovered-issuer match, usable signing-key filtering, bounded caches, one forced refresh for planned key rotation, fail-closed provider errors                      |
| Expired or replayed access token               | Required expiration, optional not-before validation, bounded token size and clock skew, permission checks on every protected request; application-specific revocation remains provider policy        |
| Broken object-level authorization              | Domain ownership checks, permission guards, verified tenant mapping, automated authorization tests                                                                                                   |
| Credential leakage                             | Redacted structured logs, tracked-file secret scan, private vulnerability reporting, secret-manager references instead of committed values, documented rotation procedure                            |
| Cross-origin abuse                             | Explicit allowed origin, method and header lists, no credentialed CORS by default                                                                                                                    |
| Proxy spoofing and client-address confusion    | Explicit trusted-hop count, no application parsing of `X-Forwarded-For`, deployment verification against the shortest trusted ingress path, allowlisted proxy function when paths vary               |
| Brute force and resource exhaustion            | PostgreSQL-backed multi-replica request policies, verified subject and tenant keys, request-size defaults, queue isolation, fail-closed store errors                                                 |
| Cross-tenant access or noisy-neighbor impact   | Tenant identity originates only from verified claims, tenant-aware authorization and rate-limit policy, hashed storage keys, ownership checks, no trust in tenant headers or event payload overrides |
| Worker replay changes identity or state        | Versioned event contracts, persisted actor and tenant context, idempotency keys, conditional state transitions, bounded retries, quarantine and audited replay commands                              |
| Injection and malformed input                  | Runtime domain validation, UUID parsing, normalized errors, CodeQL and lint gates                                                                                                                    |
| Dependency compromise                          | Frozen lockfile, dependency review, vulnerability audit, license policy                                                                                                                              |
| Sensitive-data exposure                        | Security response headers, error normalization, telemetry redaction, least-privilege permissions                                                                                                     |
| Audit tampering or ambiguity                   | Stable audit event names, actor/resource/outcome fields, request and trace correlation, replay and operator actions recorded separately                                                              |

## Identity and key lifecycle

The API fails closed when OIDC discovery or JWKS retrieval is unavailable and no valid cached material can verify the token. Provider failures return `identity_provider_unavailable`; malformed, expired, wrong-issuer, wrong-audience, or unverifiable tokens return `invalid_access_token`; valid identities without required permissions return `insufficient_permissions`.

Provider signing keys remain provider-owned. New public keys must be published before tokens use them, and old public keys must remain available for at least the maximum token lifetime plus clock skew. Application-owned client, session, callback, and deployment secrets follow the overlap, rollout, verification, revocation, and audit procedure in `docs/security/identity-operations.md`.

Production incidents must never be mitigated by enabling the development verifier, bypassing permission guards, trusting unsigned headers, widening algorithms without review, or extending clock skew beyond policy.

## Proxy trust and distributed controls

`API_TRUSTED_PROXY_HOPS` is part of the security boundary, not a convenience setting. Zero ignores forwarded addresses. A positive value is safe only for a fixed ingress chain whose shortest trusted path matches the configured count. Variable or partially untrusted paths require an explicit allowlisted proxy function before rollout.

Rate-limit identity uses the verified subject when present and the framework-resolved client address otherwise. Tenant limits use only a verified mapped tenant claim. Raw subjects, tenants, routes, and addresses are hashed before storage. A distributed-store failure returns `rate_limit_unavailable`; replicas do not silently switch to independent counters.

## Worker replay and multi-tenant boundaries

Durable events must preserve the authenticated actor, verified tenant, correlation identifiers, contract version, and idempotency key captured when the API authorized the action. Workers must not recalculate identity from mutable request headers, event payload fields controlled by callers, or model output. Replay may retry the recorded operation but may not broaden permissions, change tenant ownership, or regress a completed state transition.

Application-specific reviews must verify that repository queries, cache keys, object ownership, rate limits, logs, metrics, and external tool calls remain tenant-scoped. Absence of a configured verified tenant claim means tenant policy is omitted; it must never cause a fallback to an unverified tenant header.

## Agent-specific threats

Agentic applications must additionally review:

- prompt injection that attempts to override application policy
- tool invocation with attacker-controlled arguments
- confused-deputy behavior where an agent acts with broader privileges than the initiating user
- data exfiltration through model prompts, tool outputs, logs, or telemetry
- unbounded loops, token use, queue fan-out, or external API spend
- model output being treated as trusted code, SQL, shell input, HTML, or authorization data

Authorization must be evaluated by deterministic application code. Model output must never grant permissions, select an identity, choose a tenant, or bypass policy checks.

## Verification expectations

Security integration verification must cover valid and expired access tokens, planned signing-key rotation, invalid issuer and audience, permission denial, subject-scoped rate limiting, and failure classification. Deployment verification must also confirm trusted-proxy topology, provider outage alerts, tenant isolation, and replay auditability.

## Review process

Update the threat model when adding a new identity provider, data class, external tool, privileged worker capability, public endpoint, tenant boundary, proxy topology, replay path, or deployment environment. Record accepted risks and compensating controls in an ADR or the relevant delivery task.
