# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability, exposed credential, or security-sensitive configuration defect.

Use the repository's **Security** tab to submit a private vulnerability report through GitHub Security Advisories. Include:

- the affected component and commit or version
- reproduction steps or a minimal proof of concept
- the expected and observed security boundary
- known impact and any suggested mitigation

If private reporting is unavailable, contact a repository maintainer privately and ask for a secure reporting channel without including exploit details in the initial message.

## Response expectations

Maintainers should acknowledge a report, establish severity and scope, and coordinate remediation before public disclosure. Timelines depend on impact and exploitability; reporters should not assume that an unacknowledged public disclosure is safe.

## Supported versions

This template is maintained on the default branch. Public template releases follow the support and migration guidance in `docs/template-releases.md` and `docs/template-upgrades.md`. Generated applications are responsible for documenting their own supported release lines and backport policy.

## Repository security validation

The complete validation contract includes secret scanning, dependency audit policy, license policy, focused security tests, production-readiness checks, and generated-workspace validation:

```bash
pnpm security:secrets
pnpm security:audit
pnpm security:licenses
pnpm nx run api:test --skip-nx-cache
pnpm production:check -- infra/environments/production.env
```

Use `pnpm check` for the repository-wide contract. A scanner or test pass is evidence for review, not a substitute for threat modeling or deployment-specific controls.

## Security requirements for generated applications

Before production deployment:

- select and configure the production browser authentication and OIDC verifier profiles;
- configure HTTPS, CORS, trusted proxies, distributed rate limiting, telemetry, backup ownership, and secret management;
- rotate application-owned credentials and verify identity-provider key rotation and outage behavior;
- extend `docs/security/threat-model.md` for the application's data, tenants, tools, providers, and deployment topology;
- complete `docs/generated-project-checklist.md` and pass `pnpm production:check` against the exact release environment.

See `docs/security/identity-operations.md` for rotation and outage procedures. Never commit production secrets. The repository's secret scanner is a baseline control, not a substitute for a dedicated secret manager or platform-level secret scanning.
