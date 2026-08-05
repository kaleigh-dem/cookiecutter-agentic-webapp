# Nx cache inputs and affected execution

## Scope

P13-04 audits the cache inputs and affected graph used by required CI. The goal is to skip work only when Nx can prove that an output is unchanged, while retaining explicit validation for generated workspaces and generator output.

## Declared inputs

`nx.json` separates the inputs that are not represented by ordinary project source files:

- `browserEnvironment` contains the four `NEXT_PUBLIC_*` values embedded in the browser build.
- `imageMetadata` contains version, revision, workflow-run, and release-input metadata embedded in production images.
- `containerCommonFiles` contains the shared container wrapper and `.dockerignore`.
- `contractGeneration` contains contract source, generator scripts, and OpenAPI inputs, excluding generated outputs.
- `workspaceGeneration` contains generator implementation and template lifecycle files.
- `deliveryConfiguration` contains delivery scripts, environment examples, release metadata, performance budgets, the CI baseline, and the image-scan policy.

Container targets add their own Dockerfile and image-name variables. The API and worker share `infra/docker/Dockerfile.node-service`; the web target uses `infra/docker/Dockerfile.web` and also consumes browser environment inputs. Container and verification targets that produce external side effects or inspect a clean checkout remain non-cacheable.

## Deterministic audit

Run:

```bash
node tools/delivery/nx-cache-audit.mjs
```

The checked-in fixture verifies relevant positive and negative cases for environment, Nx configuration, Docker, generator, contract, and delivery changes. It also proves that a documentation-only change does not invalidate the audited targets. The same audit verifies the required-CI contract:

- checkout retains full history;
- `nx-set-shas` establishes `NX_BASE` and `NX_HEAD`;
- typecheck and build use `nx affected`;
- both generator smoke targets remain explicit;
- the generated-workspace workflow continues to watch generator, template, and Nx configuration paths.

Required source-repository CI runs the audit before delivery checks. Focused Vitest coverage proves that removing a browser environment input or restoring full-workspace CI fails the audit; generated workspaces skip these source-only workflow-contract assertions.

## Affected execution policy

Required CI runs typecheck and build together through:

```bash
pnpm nx affected -t typecheck build --parallel=3
```

This replacement is limited to required CI. The non-blocking Node 26 compatibility job intentionally keeps full-workspace typecheck, test, and build coverage. Generator smokes remain explicit in required CI, and `.github/workflows/generated-workspace.yml` remains a separate required lifecycle check when template-affecting paths change.

When adding a cacheable target, declare every file and environment value that can alter its output. Prefer target-specific inputs over broad workspace inputs, and add both a positive and negative audit fixture before narrowing required CI further.
