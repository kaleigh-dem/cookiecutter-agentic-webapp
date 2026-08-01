# Security audit-event conventions

Security audit events record who attempted a sensitive action, what resource was involved, and whether policy allowed it. They are distinct from debug logs and business analytics.

## Stable event contract

Use the structured event name `security.audit` with these attributes:

- `action` — stable dotted action name, such as `agent-task.create`
- `actorId` — authenticated subject identifier; never accept it from an unverified request header
- `outcome` — `allowed` or `denied`
- `resourceType` — stable resource category
- `resourceId` — resource identifier when known
- `reason` — stable denial or failure reason without sensitive details
- `requestId` and `traceId` — correlation identifiers supplied by the observability context

## Required events

Record events for:

- authentication and session lifecycle changes
- permission, role, and policy changes
- access to high-value or user-scoped resources
- administrative and destructive actions
- secret, key, or integration configuration changes
- denied authorization decisions where the attempted resource is known

## Data handling

Do not record access tokens, cookies, passwords, prompts, raw request bodies, provider assertions, or secret values. Use stable identifiers rather than email addresses or display names where possible.

Audit writers must use the shared structured logger so redaction and correlation remain consistent. A failed audit sink must be observable; applications with regulatory or high-assurance requirements should use an append-only external destination and define fail-open or fail-closed behavior explicitly.

## Review and retention

Generated applications must define retention, access controls, export requirements, and incident-response queries for their deployment environment. Changes to audit event names or fields are operational contract changes and should be reviewed like API or event-schema changes.
