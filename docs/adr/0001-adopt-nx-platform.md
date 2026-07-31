# ADR 0001: Adopt Nx as the monorepo platform

- Status: Accepted
- Date: 2026-07-31

## Context

The first scaffold used pnpm and Turborepo, with custom plans for project graphs,
boundary enforcement, generators, affected CI, and agent integrations. Those are
generic platform capabilities rather than application-specific differentiators.

## Decision

Use an Nx 23 integrated/package-workspace hybrid as the foundation.

- pnpm remains the package manager.
- Next.js, NestJS, and Node applications are first-class Nx projects.
- Architectural boundaries use project tags and `@nx/enforce-module-boundaries`.
- CI uses `nx affected`.
- Agents receive Nx workspace context through `AGENTS.md`, skills, and Nx MCP.
- Repeated application structure will be encoded in local Nx generators.

## Consequences

We stop maintaining a Python Cookiecutter engine and a duplicate task graph.
The repository itself becomes an Nx template. Future work can focus on database,
contracts, observability, security, and vertical application architecture.
