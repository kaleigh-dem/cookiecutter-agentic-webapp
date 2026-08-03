# Threat model guidance

This document defines the baseline security model for applications generated from this template. Every production application must extend it with application-specific assets, actors, data classifications, and abuse cases.

## Assets

- user identities, sessions, access tokens, and signing keys
- agent prompts, task inputs, generated outputs, and tool results
- database records, job payloads, and outbox events
- deployment credentials and third-party API secrets
- audit records, traces, request identifiers, and operational telemetry

## Trust boundaries

1. **Browser to web application** — untrusted user input enters the application.
2. **Web application to API** — bearer credentials and correlation identifiers cross an HTTP boundary.
3. **API to database and queue** — authorized application actions become durable state and asynchronous work.
4. **Worker to external tools** — agent-controlled or model-derived inputs may reach third-party systems.
5. **CI to deployment environments** — repository content and dependencies can influence privileged automation.

## Baseline threats and controls

| Threat                              | Baseline controls                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Identity spoofing                   | Provider-issued bearer tokens, adapter-level verification, production rejection of development tokens |
| Broken object-level authorization   | Domain ownership checks, permission guards, automated authorization tests                             |
| Credential leakage                  | Redacted structured logs, tracked-file secret scan, private vulnerability reporting                   |
| Cross-origin abuse                  | Explicit allowed origin, method and header lists, no credentialed CORS by default                     |
| Brute force and resource exhaustion | PostgreSQL-backed multi-replica request policies, request-size defaults, queue isolation              |
| Injection and malformed input       | Runtime domain validation, UUID parsing, normalized errors, CodeQL and lint gates                     |
| Dependency compromise               | Frozen lockfile, dependency review, vulnerability audit, license policy                               |
| Sensitive-data exposure             | Security response headers, error normalization, telemetry redaction, least-privilege permissions      |
| Audit tampering or ambiguity        | Stable audit event names, actor/resource/outcome fields, request and trace correlation                |

## Agent-specific threats

Agentic applications must additionally review:

- prompt injection that attempts to override application policy
- tool invocation with attacker-controlled arguments
- confused-deputy behavior where an agent acts with broader privileges than the initiating user
- data exfiltration through model prompts, tool outputs, logs, or telemetry
- unbounded loops, token use, queue fan-out, or external API spend
- model output being treated as trusted code, SQL, shell input, HTML, or authorization data

Authorization must be evaluated by deterministic application code. Model output must never grant permissions, select an identity, or bypass policy checks.

## Review process

Update the threat model when adding a new identity provider, data class, external tool, privileged worker capability, public endpoint, or deployment environment. Record accepted risks and compensating controls in an ADR or the relevant delivery task.
