# Authentication and Authorization

This page separates local authentication from production identity and explains browser credentials, API token verification, permission mapping, provider outages, and adopter-owned security work.

## Prerequisites

- For production: an OIDC provider, application registration, owned domains, HTTPS, and a secure server-side session strategy.

## Local development authentication

The default local `.env` uses:

```dotenv
NEXT_PUBLIC_AUTHENTICATION_PROFILE=development
AUTH_ACCESS_TOKEN_VERIFIER=development
AUTH_DEVELOPMENT_TOKEN=local-development-token
AUTH_DEVELOPMENT_SUBJECT=00000000-0000-4000-8000-000000000001
AUTH_DEVELOPMENT_TENANT=local-tenant
AUTH_DEVELOPMENT_PERMISSIONS=agent-tasks:read,agent-tasks:write,operations:read
```

This path is deterministic and development-only. The browser sends the fixed token, and the API maps it to the configured principal. The development verifier rejects production operation.

Never treat the sample token, subject, tenant, or permissions as production identities.

## Unauthenticated browser mode

`NEXT_PUBLIC_AUTHENTICATION_PROFILE=none` sends no `Authorization` header. It does not make protected API routes public. The API remains on the production verifier for generated production profiles, so unauthenticated access must be an explicit route and product decision.

## OIDC mode

OIDC mode has two independent parts:

1. The browser obtains short-lived API access tokens.
2. The API verifies those access tokens.

Do not send browser ID tokens to the API as access tokens.

### Browser credential endpoint

The reference adapter calls a same-origin endpoint such as:

```text
/auth/session/access-token
```

The endpoint accepts `POST` with the secure session cookie and returns:

```json
{
  "accessToken": "short-lived-access-token",
  "expiresAt": "2026-08-02T21:00:00.000Z"
}
```

The endpoint must keep refresh tokens, provider client secrets, and session encryption material server-side or in secure `HttpOnly` cookies.

The adapter:

- stores the access token only in memory
- never writes tokens to local or session storage
- renews before expiry
- deduplicates concurrent renewals
- invalidates credentials after sign-out or authentication failure
- rejects non-same-origin endpoint forms

A reload obtains a new token from the secure session.

### API verifier configuration

```dotenv
AUTH_ACCESS_TOKEN_VERIFIER=oidc
AUTH_OIDC_ISSUER=https://identity.example.com/tenant
AUTH_OIDC_AUDIENCE=agentic-api
AUTH_OIDC_ALLOWED_ALGORITHMS=RS256
AUTH_OIDC_CLOCK_SKEW_SECONDS=60
```

The verifier uses OIDC discovery, requires the discovered issuer to match exactly, and retrieves keys from an HTTPS `jwks_uri`.

Supported algorithms:

```text
RS256, RS384, RS512, PS256, PS384, PS512
```

Use the smallest provider-compatible allowlist. Unsigned tokens, symmetric MAC algorithms, issuer mismatch, audience mismatch, expiry, invalid `nbf`, malformed tokens, and invalid claim mapping are rejected.

## Session mode

Session mode uses the same browser credential endpoint contract but assumes the application owns the server session. The generated repository does not implement the organization-specific session store, cookie policy, login, callback, logout, or provider refresh behavior.

## Claims and permissions

Defaults:

```dotenv
AUTH_OIDC_SUBJECT_CLAIM=sub
AUTH_OIDC_PERMISSIONS_CLAIM=permissions
AUTH_OIDC_SCOPE_CLAIM=scope
AUTH_OIDC_TENANT_CLAIM=tenant_id
```

Claim paths can be dotted. Permissions can be arrays or comma/space-separated strings. Permissions and scopes are merged and deduplicated.

Provider role expansion should be implemented in an `OidcClaimsMapper`, not in controllers or guards.

## Discovery, JWKS, and rotation

```dotenv
AUTH_OIDC_DISCOVERY_CACHE_TTL_MS=300000
AUTH_OIDC_JWKS_CACHE_TTL_MS=300000
AUTH_OIDC_REQUEST_TIMEOUT_MS=5000
```

When a token references an unknown key, the verifier performs one forced JWKS refresh and retries. This supports normal key rotation without an unbounded fetch loop.

Providers should publish new public keys before using them and retain old public keys for the maximum token lifetime plus clock skew.

## Failure behavior

| Condition                                                                            | API result                          |
| ------------------------------------------------------------------------------------ | ----------------------------------- |
| Malformed token, bad signature, wrong issuer/audience, expired token, invalid claims | `401 invalid_access_token`          |
| Valid identity without required permission                                           | `403 insufficient_permissions`      |
| Discovery/JWKS outage, malformed provider metadata, unusable keys                    | `503 identity_provider_unavailable` |

The system fails closed. Do not switch production to the development verifier during an outage.

## Production replacement points

Selecting `oidc` or `session` still requires:

1. Provider application/client registration.
2. Login, callback, and logout routes.
3. Secure session cookies and server-side refresh handling.
4. The same-origin short-lived access-token endpoint.
5. Issuer, audience, algorithm, subject, permission, scope, and tenant mapping.
6. Key and client-secret rotation.
7. Provider outage monitoring and business continuity decisions.
8. Representative integration tests.
9. Application-specific threat-model review.

## Verification

Run integrated API security tests:

```bash
pnpm nx run api:test --skip-nx-cache
```

Validate production configuration:

```bash
pnpm production:check -- infra/environments/production.env
```

Exercise at minimum:

- valid token
- expired token
- future `nbf`
- wrong issuer
- wrong audience
- unknown key and rotated key
- permission denial
- absent/expired browser session
- token renewal and concurrent renewal
- logout invalidation
- provider outage

## Related pages

- [Choosing Workspace Profiles](Choosing-Workspace-Profiles)
- [Production Readiness](Production-Readiness)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [Database and Data Management](Database-and-Data-Management)
2. [Production Readiness](Production-Readiness)

[Back to Home](Home)
