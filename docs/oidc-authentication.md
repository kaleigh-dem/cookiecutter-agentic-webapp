# OIDC access-token verification

The API supports a replaceable access-token verifier through the `AccessTokenVerifier` interface in `apps/api/src/app/security/security.module.ts`.

- development and test environments default to the deterministic development verifier
- production defaults to the OIDC verifier
- `AUTH_ACCESS_TOKEN_VERIFIER=development|oidc` selects the implementation explicitly
- the development verifier rejects every token when `NODE_ENV=production`

The browser credential acquisition and refresh flow is intentionally separate. The API verifier accepts bearer access tokens issued by the configured identity provider; P12-02 owns the production browser adapter. Do not send browser ID tokens to the API as access tokens.

## Required production configuration

Set these values in the API environment:

```dotenv
AUTH_ACCESS_TOKEN_VERIFIER=oidc
AUTH_OIDC_ISSUER=https://identity.example.com/tenant
AUTH_OIDC_AUDIENCE=agentic-api
```

`AUTH_OIDC_ISSUER` must be the exact HTTPS issuer string carried in access tokens and returned by the provider discovery document. `AUTH_OIDC_AUDIENCE` accepts one or more comma-separated audiences; at least one must appear in the token `aud` claim.

The verifier resolves the provider metadata through OpenID Connect Discovery, verifies that the discovered issuer exactly matches the configured issuer, and loads signing keys from the discovered HTTPS `jwks_uri`. For an issuer with a path, the discovery suffix is appended to that path, such as `https://identity.example.com/tenant/.well-known/openid-configuration`.

## Signature and claim validation

The verifier rejects an access token unless all of these conditions hold:

- the compact JWT has exactly three bounded base64url segments
- the protected `alg` header is implemented and explicitly allowlisted
- an RSA signing key is selected by `kid`, use, key operations, key type, and optional key algorithm metadata
- the signature verifies with the selected JWKS public key
- `iss` exactly equals `AUTH_OIDC_ISSUER`
- `aud` contains one configured audience
- `exp` is present and has not passed, allowing only the configured clock skew
- optional `nbf` has been reached, allowing only the configured clock skew
- the configured subject claim resolves to a non-empty string

The default algorithm allowlist is `RS256`. The implemented allowlist values are:

```text
RS256, RS384, RS512, PS256, PS384, PS512
```

Configure a smaller explicit set when the provider supports more than one value:

```dotenv
AUTH_OIDC_ALLOWED_ALGORITHMS=RS256
AUTH_OIDC_CLOCK_SKEW_SECONDS=60
```

The verifier never accepts `none`, symmetric MAC algorithms, or an algorithm that is not present in its configured allowlist.

## Principal and permission mapping

Claim mapping is handled by `EnvironmentOidcClaimsMapper`, which implements the replaceable `OidcClaimsMapper` boundary.

Defaults:

```dotenv
AUTH_OIDC_SUBJECT_CLAIM=sub
AUTH_OIDC_PERMISSIONS_CLAIM=permissions
AUTH_OIDC_SCOPE_CLAIM=scope
```

Claim names may use dotted paths such as `identity.subject` or `authorization.permissions`. Permission claims may be arrays or comma/space-separated strings. Permissions and scopes are merged and deduplicated before they are passed to the existing authorization guard.

Example token claims:

```json
{
  "sub": "user-123",
  "permissions": ["agent-tasks:read"],
  "scope": "agent-tasks:write operations:read"
}
```

The resulting principal is:

```json
{
  "subject": "user-123",
  "permissions": ["agent-tasks:read", "agent-tasks:write", "operations:read"]
}
```

Provider-specific role expansion or tenant policy should be implemented as another `OidcClaimsMapper` instead of being embedded in controllers or guards.

## Discovery, caching, and key rotation

Discovery and JWKS responses are cached in memory with bounded lifetimes:

```dotenv
AUTH_OIDC_DISCOVERY_CACHE_TTL_MS=300000
AUTH_OIDC_JWKS_CACHE_TTL_MS=300000
AUTH_OIDC_REQUEST_TIMEOUT_MS=5000
```

Cache lifetimes are restricted to 1 second through 1 hour. Provider requests are restricted to 100 milliseconds through 10 seconds and use one deadline for the HTTP response and JSON body read.

When a token cannot be verified with the cached key set, the verifier performs one forced JWKS refresh and retries verification. This supports ordinary signing-key rotation without allowing an unbounded fetch loop. A token that still cannot be verified is rejected.

Discovery or JWKS transport failures, malformed metadata, issuer mismatch, non-HTTPS endpoints, and empty key sets return `503 identity_provider_unavailable`. A malformed or non-HTTPS discovered `jwks_uri` is treated as provider metadata failure rather than an internal server error. Invalid token structure, signature, claims, algorithm, or claim mapping return `401 invalid_access_token`.

## Environment examples

- `.env.example` selects the development verifier for local use.
- `infra/environments/preview.local.env` keeps the live local-preview Agent Task smoke on the development verifier through `API_NODE_ENV=development`.
- `infra/environments/preview.env.example` and `production.env.example` select OIDC and list every supported setting.
- `infra/deploy/compose.preview.yaml` passes the verifier configuration into the API container.

Replace every example issuer, audience, and claim name with values owned by the deployed identity provider. Do not copy development bearer tokens into production configuration.

## Operational checks

Before enabling OIDC in a shared environment:

1. Confirm the issuer string and discovery endpoint from the identity provider.
2. Confirm the API audience and allowed signing algorithms.
3. Confirm token lifetime, clock-skew policy, key-rotation cadence, and provider outage behavior.
4. Confirm the subject and permission/scope claim mapping with representative tokens.
5. Exercise valid, expired, not-yet-valid, wrong-issuer, wrong-audience, unknown-key, and rotated-key cases.
6. Keep discovery and JWKS endpoints reachable from every API replica over HTTPS.
7. Monitor `identity_provider_unavailable` separately from invalid-token responses.

P12-05 will add a release-time production-readiness gate. P12-06 will expand provider integration, outage, permission-denial, and rotation verification beyond the focused verifier tests delivered here.
