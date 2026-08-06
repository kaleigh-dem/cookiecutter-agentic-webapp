# ADR 0018: Enforce documentation integrity from repository sources

- Status: Accepted
- Date: 2026-08-06

## Context

SteadyStack documentation spans repository Markdown, reviewed wiki source, root scripts, environment examples, authentication guidance, generators, and architecture descriptions. Ordinary formatting checks cannot detect a renamed file, removed command, misspelled environment variable, stale identity or authentication statement, or a project graph that no longer matches the written architecture.

Generator changes and dependency-boundary changes are especially risky because they can alter the structure emitted into downstream repositories without leaving durable roadmap or architecture evidence.

## Decision

Add a deterministic repository-local documentation integrity tool under `tools/documentation` and run it in required CI.

The tool:

- validates relative Markdown links and repository paths referenced from inline code;
- validates documented root package scripts, static Node entry points, Nx projects, and Nx targets;
- checks documented environment-variable names against tracked configuration and implementation sources;
- rejects retired pre-SteadyStack identity outside the explicit historical records and checks current browser and API authentication descriptions;
- exports the Nx project graph and validates a committed Mermaid architecture diagram;
- requires `docs/TODO.md` and at least one ADR update when generator output or architectural boundaries change.

`pnpm docs:check` is the fail-closed validation command. `pnpm docs:architecture` regenerates the upstream diagram. An initialized downstream workspace skips the upstream topology artifact because application-profile selection can intentionally remove projects, while its remaining documentation checks continue to run.

## Consequences

Documentation drift becomes an executable CI failure instead of a review-only concern. Contributors must update links, commands, environment names, authentication guidance, diagrams, roadmap status, and ADR evidence in the same change that modifies their source of truth.

The checker is intentionally repository-aware rather than a general Markdown linter. New command forms, environment prefixes, historical identity exceptions, or architecture-change surfaces require focused tests before they are accepted.
