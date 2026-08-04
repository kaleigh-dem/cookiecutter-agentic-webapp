# Phase 12 exit-criteria validation

Phase 12 is complete only when the generated production profile proves the following behavior together:

1. real identities are authenticated through the production OIDC verifier;
2. generated HTTP contracts are enforced at runtime;
3. distributed rate limits remain consistent across API replicas; and
4. development-only security adapters cannot pass the production release gate.

## Evidence matrix

| Exit-criteria clause                                       | Behavioral evidence                                                                                                                                                                                                                                                                                                                                                          | Roadmap evidence                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Generated production profile authenticates real identities | `tools/delivery/phase-12-exit-criteria.spec.ts` generates an OIDC/container/PostgreSQL profile and validates its production configuration. `apps/api/src/app/security/security.integration.spec.ts` verifies signed OIDC access tokens, issuer and audience validation, expiry, permission enforcement, and signing-key rotation through the production verifier and guards. | P12-01, P12-02, and P12-06; reviewed PRs #27 and #48. |
| Runtime contracts are enforced                             | `apps/api/src/app/http-contract/http-contract.interceptor.spec.ts` rejects malformed, oversized, unknown-field, and undeclared-query inputs and fails closed on invalid handler responses. The test remains part of the generated repository's `pnpm check` contract.                                                                                                        | P12-04; reviewed PR #35.                              |
| Distributed limits work across replicas                    | `packages/database/src/adapters/postgres-rate-limit.integration.test.ts` uses two independent database connections and proves they share one atomic PostgreSQL rate-limit window. The production profile selects `API_RATE_LIMIT_STORE=postgres`.                                                                                                                            | P12-03; reviewed PR #32.                              |
| Development adapters cannot pass release readiness         | `tools/delivery/production-readiness.spec.ts` and `tools/delivery/phase-12-exit-criteria.spec.ts` reject the development token verifier, browser development profile, in-memory rate-limit store, and configured development token. The release workflow invokes `pnpm production:check`.                                                                                    | P12-05; reviewed PR #36.                              |

## Required validation

The phase-closure pull request must pass the exact-head CI, Delivery, Security, and Generated Workspace workflows. Generated Workspace runs the generated repository's full `pnpm check`, so the OIDC, runtime-contract, distributed-rate-limit, and production-readiness proofs remain part of the generated validation contract.

PR #49 is dedicated to Phase 12 closure evidence and must not include Phase 13 implementation.

Operational behavior and residual risks are documented in:

- `docs/oidc-authentication.md`;
- `docs/rate-limiting.md`;
- `docs/api-contracts.md`;
- `docs/security/threat-model.md`; and
- `docs/security/identity-operations.md`.
