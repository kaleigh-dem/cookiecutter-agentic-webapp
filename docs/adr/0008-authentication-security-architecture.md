# ADR 0008: Authentication and security architecture

## Status

Accepted

## Context

The template needs a repeatable security boundary for large-scale agentic web applications without coupling generated applications to one identity vendor.

## Decision

Use a provider-neutral authentication boundary:

- The web application obtains identity from a configured identity provider.
- API services validate signed access tokens through an authentication adapter.
- Authorization decisions remain inside application policy boundaries and domain services.
- Security-sensitive actions emit audit events with actor, action, resource, and correlation identifiers.

Development environments may use deterministic test identities. The browser development adapter is disabled for every production build and cannot be re-enabled with public build-time configuration. Production deployments must use managed identity providers, key rotation, and HTTPS-only transport.

## Consequences

This keeps generated applications portable while preventing authentication concerns from leaking into domain logic.
