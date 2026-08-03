# Browser authentication profiles

The browser authentication boundary is replaceable and selected explicitly at web build time. Production builds must not inherit the deterministic development token.

## Profiles

`NEXT_PUBLIC_AUTHENTICATION_PROFILE` accepts four values:

- `development` uses the fixed `local-development-token` and is rejected when `NODE_ENV=production`.
- `oidc` obtains short-lived OIDC access tokens from the same-origin session credential endpoint.
- `session` uses the same credential endpoint contract for an application-owned server session that yields API access tokens.
- `none` intentionally sends no `Authorization` header. Protected API routes remain protected; generated applications must explicitly make routes public when they choose an unauthenticated product profile.

Generated workspaces record the selected profile in `workspace.template.json` and emit matching browser and API environment defaults. OIDC and session profiles select the production OIDC API verifier. The unauthenticated browser profile also keeps the API on the OIDC verifier so omitting browser identity never silently enables development authentication.

## Session credential endpoint

The reference production adapter calls the same-origin path configured by `NEXT_PUBLIC_AUTH_SESSION_ENDPOINT`. The recommended path is:

```text
/auth/session/access-token
```

The endpoint must accept `POST` with the browser's same-origin secure session cookie and return JSON:

```json
{
  "accessToken": "short-lived-access-token",
  "expiresAt": "2026-08-02T21:00:00.000Z"
}
```

`expiresAt` may also be an epoch-millisecond number. The endpoint should use the identity provider's server-side SDK or OAuth client to obtain or refresh the user's API access token. Refresh credentials and provider client secrets must remain server-side or in `HttpOnly`, `Secure`, same-site cookies; the endpoint must never return a refresh token to browser JavaScript.

A `401` response means the user must authenticate again. Other non-success responses are treated as provider or session infrastructure failures.

## Storage and renewal

The adapter:

- stores the current access token only in memory
- never writes access or refresh tokens to local storage or session storage
- requests renewal before expiry according to `NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS`, defaulting to 30 seconds
- deduplicates concurrent renewal requests
- supports explicit invalidation after sign-out or an API authentication failure
- requires the credential endpoint to be a same-origin absolute path, preventing session cookies from being sent to an arbitrary origin

A page reload discards the in-memory access token and obtains a fresh one through the secure server session.

## Build configuration

Next.js public variables are embedded into the web image. Set these values before `pnpm nx run web:container` or the corresponding release build:

```dotenv
NEXT_PUBLIC_AUTHENTICATION_PROFILE=oidc
NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=/auth/session/access-token
NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS=30
```

Changing these public variables only at container runtime does not change an already-built web image. Rebuild the image from reviewed source when selecting a different browser authentication profile or endpoint.

The API remains configured independently:

```dotenv
AUTH_ACCESS_TOKEN_VERIFIER=oidc
AUTH_OIDC_ISSUER=https://identity.example.com/tenant
AUTH_OIDC_AUDIENCE=agentic-api
```

The browser adapter obtains credentials; the API verifier validates them. Provider-specific login, callback, logout, and secure-session routes belong in the generated application's web server and must conform to the credential endpoint contract above.

## Testing an integration

Tests should cover:

1. obtaining an access token from an existing user session
2. renewing near expiry without exposing a refresh token
3. deduplicating simultaneous renewal requests
4. clearing the in-memory credential on sign-out
5. returning `401` when the server session is absent or expired
6. ensuring production builds reject the development profile and missing profile configuration

The reference adapter tests use an injected clock and fetch implementation so storage and renewal behavior are deterministic.
