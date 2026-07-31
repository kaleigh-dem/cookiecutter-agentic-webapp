# ADR 0001: Start with a modular monolith

- Status: Accepted

## Context

The product needs strong business boundaries without premature distributed-systems overhead.

## Decision

Deploy one API while structuring business capabilities as independently owned modules with public interfaces and data ownership.

## Consequences

Local development and transactions remain simple. Boundary enforcement and module documentation are mandatory. A module can be extracted later when operational evidence justifies it.
