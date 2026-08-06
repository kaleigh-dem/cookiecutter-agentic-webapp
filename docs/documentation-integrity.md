# Documentation integrity

SteadyStack treats documentation as a validated interface. The repository checks reviewed Markdown against the files, commands, configuration names, identity rules, authentication behavior, and Nx architecture that the documentation describes.

## Run the checks

Install dependencies, then run:

```bash
pnpm docs:check
```

The command runs focused Node tests and the repository audit. It is also part of `pnpm check` and required pull-request CI.

Regenerate the architecture artifact after adding, removing, retagging, or rewiring an Nx project:

```bash
pnpm docs:architecture
pnpm docs:check
```

Commit `docs/architecture/project-graph.md` with the source change. The file is generated from `pnpm nx graph --file=...`; do not edit it manually.

## Scope

The content and topology audit is specific to the reviewed upstream template package, `@steadystack/source`. Initialization intentionally removes template-maintainer workflows and release documents, replaces the public identity with the adopting product identity, and can remove projects through profile selection. An initialized downstream workspace therefore runs the checker’s deterministic unit tests but skips the upstream repository audit. Adopting teams can extend the inherited validation command with product-specific documentation rules.

## What is validated

The upstream audit checks:

- relative Markdown links and linked files;
- repository paths written in inline code;
- root `pnpm` scripts, static `node` entry points, Nx project names, and Nx targets shown in shell examples;
- environment variables documented in dotenv blocks or inline code;
- retired pre-SteadyStack identity outside approved historical records;
- the implemented browser profiles and OIDC verifier behavior described in the authentication documentation;
- byte-for-byte agreement between the committed Mermaid diagram and the current Nx project graph;
- roadmap and ADR evidence for changes to generator output or architectural boundaries.

External URLs and section anchors are not fetched. Their availability and prose quality remain review responsibilities. Explicit generator examples and untracked runtime environment files are recognized as examples rather than repository artifacts.

## Change-evidence gate

A pull request must update both `docs/TODO.md` and at least one file under `docs/adr/` when it changes any of these surfaces:

- workspace generator implementations or template lifecycle files;
- `eslint.config.mjs`, `nx.json`, or `tsconfig.base.json`;
- the tags or implicit dependencies of an existing `project.json`;
- the addition, removal, or rename of an Nx project.

The gate uses the exact Nx base and head revisions supplied by CI. Local source archives without a comparison ref still run every content and graph check, but skip only this diff-based requirement.

## Fixing failures

Treat the implementation as the source of truth unless the implementation is itself wrong.

- Broken link or path: correct the destination or restore the referenced file.
- Unknown command: correct the example or add the intended reviewed script or target.
- Unknown environment variable: correct the name and keep the canonical environment example or implementation source current.
- Stale identity or authentication language: align the current document; preserve retired names only in the approved migration and historical ADR files.
- Stale graph: run `pnpm docs:architecture` and review the dependency change.
- Missing change evidence: update the roadmap and record the durable architectural decision in an ADR.

The checker writes the expected graph to the CI diagnostics directory when graph validation fails, so the normal retained CI failure artifact contains the correction candidate.
