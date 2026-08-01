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

This template is maintained on the default branch. Generated applications are responsible for documenting their own supported release lines and backport policy.

## Security requirements for generated applications

Before production deployment, replace all development authentication adapters with a managed identity provider, configure HTTPS, rotate signing keys and credentials, restrict allowed origins, and review the application-specific threat model.

Never commit production secrets. The repository's secret scanner is a baseline control, not a substitute for a dedicated secret manager or platform-level secret scanning.
