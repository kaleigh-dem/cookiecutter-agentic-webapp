# Identity and secret operations

This runbook covers identity-provider outages and rotation of application-owned authentication secrets for production applications generated from this template. It complements `docs/oidc-authentication.md`, `docs/browser-authentication.md`, and the application-specific incident response plan.

## Ownership and inventory

Before production rollout, record an accountable owner and rotation cadence for every identity-related secret or credential:

- browser OIDC client credentials, when the selected browser adapter uses a confidential client;
- session signing, encryption, and cookie-protection keys;
- callback or webhook verification secrets used by the identity integration;
- deployment credentials that can update identity configuration;
- emergency break-glass credentials, stored outside the normal application path.

The API access-token verifier consumes provider-published signing keys through OIDC discovery and JWKS. Those signing private keys remain provider-owned and must never be copied into this repository or application configuration.

## Rotation procedure

1. Create the replacement secret in the authoritative secret manager and record its version, owner, and intended activation time.
2. Prefer an overlap window in which both old and new values are accepted. When the provider or adapter cannot support overlap, schedule a coordinated maintenance window and document the expected session impact.
3. Deploy the new secret reference without printing either value in logs, workflow output, generated plans, or pull-request comments.
4. Verify a complete authentication flow, token refresh or session renewal, permission enforcement, logout, and representative API access in the target environment.
5. Revoke the old value only after every application replica and background consumer uses the new version.
6. Confirm that stale sessions, cached credentials, and rollback artifacts cannot reactivate the retired value.
7. Record completion evidence and the next rotation date in the application operations system.

An emergency rotation follows the same sequence with a shortened overlap window. Treat suspected disclosure as an incident: revoke the affected credential, invalidate derived sessions when supported, review audit and identity-provider logs, and rotate adjacent credentials that may share trust.

## Provider signing-key rotation

The API caches discovery and JWKS responses for bounded periods. When a token references an unknown signing key, the verifier performs one forced JWKS refresh and retries verification. Operators should:

- keep the discovery document and HTTPS JWKS endpoint reachable from every API replica;
- retain old public keys for at least the maximum issued-token lifetime plus configured clock skew;
- introduce new keys before issuing tokens that depend on them;
- monitor invalid-token rates during rotation and distinguish unknown-key failures from issuer, audience, or expiry failures;
- test planned rotation with representative tokens before changing the provider production key set.

Do not work around a rotation failure by widening the algorithm allowlist, disabling issuer or audience checks, increasing clock skew beyond policy, or accepting unsigned tokens.

## Identity-provider outage behavior

The API fails closed. Discovery or JWKS transport failures, invalid provider metadata, issuer mismatch in discovery, non-HTTPS key endpoints, and unusable key sets return `503 identity_provider_unavailable`. Invalid token structure, signatures, claims, or permission mapping return `401 invalid_access_token`. Authorization failures for an otherwise valid identity return `403 insufficient_permissions`.

During an outage:

1. Confirm whether failure is limited to login or refresh, or also affects API verification because required keys are absent or expired from cache.
2. Preserve already-issued credentials only while they continue to pass normal signature, issuer, audience, expiry, and permission validation.
3. Do not switch production to the development verifier, bypass authorization guards, or fall back to unsigned identity headers.
4. Keep health, status, and other explicitly public operational endpoints available only when their existing access policy allows it.
5. Alert on `identity_provider_unavailable` separately from `invalid_access_token`, and correlate provider status, API replica logs, and recent key changes.
6. Communicate expected user impact and recovery status without exposing tokens, key identifiers beyond operational need, or secret material.
7. After recovery, verify discovery, JWKS retrieval, valid and expired tokens, key rotation, permission denial, and browser refresh or session renewal.

If the outage exceeds the accepted recovery objective, use only pre-approved business continuity procedures. Any temporary alternate identity provider, cached-session extension, or break-glass access path requires an explicit security decision and application-specific threat-model update.

## Verification checklist

- Valid tokens reach protected routes only with the required permission.
- Expired, wrong-issuer, and wrong-audience tokens are rejected.
- A new provider signing key is accepted after one bounded JWKS refresh.
- Permission denial remains distinct from authentication failure.
- Rate-limit counters remain scoped to verified subjects and tenants and fail closed when the distributed store is unavailable.
- Trusted-proxy configuration matches the deployed ingress topology.
- Worker replay cannot change the initiating actor, tenant, or authorization decision recorded with the durable event.

The repository security integration suite composes the production OIDC verifier, authentication and authorization guards, reflector metadata, and rate-limit store to exercise identity, rotation, permission, and subject-scoped limit behavior together. Run it with `pnpm nx run api:test --skip-nx-cache`.
