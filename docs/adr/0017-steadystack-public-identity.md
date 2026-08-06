# ADR 0017: Adopt the SteadyStack public identity

- Status: accepted
- Date: 2026-08-05

## Context

The platform's former template, package, executable, artifact, and repository names were coupled to an early implementation label. They now appear throughout source imports, generators, release tooling, runtime defaults, generated-workspace provenance, workflows, and documentation. A partial rename would create incompatible package graphs and ambiguous upgrade behavior.

The repository's agent, coding-agent, agentic-development, and agent-compatible terminology describes the operating model and is not part of the former brand.

## Decision

Adopt `SteadyStack` as the exact display name, `steadystack` as the lowercase technical prefix, `@steadystack` as the package scope, `@steadystack/source` as the root package, `@steadystack/workspace-plugin` as the public Nx plugin, `steadystack-upgrade` as the canonical executable, and `steadystack-workspace-plugin` as the release artifact basename. Prepare tracked repository references for the future GitHub rename from `kaleigh-dem/nx-fullstack-platform` to `kaleigh-dem/steady-stack`.

Retain the former upgrade executable as a deprecated alias because version 0.2.0 exposed it publicly. Retain former identities only in historical records, the 0.1.0 compatibility fixture, its ordered migration input, and explicit migration guidance. Generated downstream workspaces remain free to choose identities unrelated to SteadyStack.

## Consequences

All active repository-owned packages, imports, commands, artifacts, provenance, runtime identity defaults, and links use SteadyStack. Existing consumers have an explicit migration path and a tested temporary executable alias. Historical ADRs and release records remain truthful. The GitHub repository setting, publishing permissions, wiki remote, trusted reviewer checkout, and external integrations require post-merge verification.
