# CI Diagnostics

Use this page when a required GitHub Actions run is cancelled, fails without enough console context, or behaves differently from a local run. The cancellation, BuildKit cache, and retained-artifact behavior described here was completed in PR #55.

## Concurrency and cancellation

CI, Delivery, Security, and Generated workspace group runs by workflow and pull-request number.

- A newer commit to the same pull request cancels an older in-progress run of the same workflow.
- Runs for different pull requests do not cancel one another.
- Protected `main` runs remain complete.
- Scheduled and manually dispatched runs remain complete.
- Cancellation means the older commit was superseded; it is not evidence that the newer commit passed.

Always review checks attached to the exact pull-request head SHA.

## Failure artifact lookup

Artifacts are uploaded only after failure and only when the workflow produced matching files.

| Failure class                                      | Workflow artifact                                        | Inspect first                                                                      |
| -------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Browser or Playwright failure                      | `ci-failure-<run_id>-<run_attempt>`                      | `playwright-results/`, retained trace/video/screenshots, then `playwright-report/` |
| CI release-plan generation or validation           | `ci-failure-<run_id>-<run_attempt>`                      | `release-plan.json`                                                                |
| Documentation-integrity or stale graph             | `ci-failure-<run_id>-<run_attempt>`                      | `project-graph.md`, then the failing `pnpm docs:check` output                      |
| Preview startup, health, smoke, or service failure | `delivery-failure-<run_id>-<run_attempt>`                | `service-logs.txt`                                                                 |
| Performance-budget failure                         | `delivery-failure-<run_id>-<run_attempt>`                | `performance-report.json`, then `service-logs.txt`                                 |
| Generated-workspace lifecycle failure              | `generated-workspace-diagnostics-<run_id>-<run_attempt>` | the failed step's generated workspace output and test-output bundle                |
| Security policy failure                            | no dedicated failure bundle                              | failing Security job output and the focused local security command                 |

The workflows retain these failure artifacts for 14 days. Download evidence before rerunning or closing a long-running investigation.

## Download an artifact

1. Open the failed workflow run.
2. Confirm the run's commit SHA matches the commit under investigation.
3. In **Artifacts**, download the matching failure bundle.
4. Extract it into a separate diagnostic directory; do not overwrite a local test-output directory that contains other evidence.

A rerun uses a new run attempt and therefore a different artifact name. Keep the run ID and attempt with any incident or pull-request notes.

## Inspect documentation-integrity failures

P13-05 runs the upstream SteadyStack documentation-integrity audit in CI as part of `pnpm docs:check`. When architecture validation detects that the committed Nx graph is stale, the checker writes the expected `project-graph.md` into the CI diagnostics directory. That file is retained in `ci-failure-<run_id>-<run_attempt>` with the rest of the CI failure evidence.

Start with the failing `pnpm docs:check` output to identify whether the failure is a link/path/command/environment/identity/authentication issue, missing roadmap/ADR evidence, or architecture drift. For a stale graph, compare the retained `project-graph.md` with `docs/architecture/project-graph.md`, then regenerate from the exact source revision:

```bash
pnpm docs:architecture
pnpm docs:check
```

`pnpm docs:architecture` rewrites the committed upstream architecture artifact from the Nx project graph; `pnpm docs:check` reruns the focused checker tests and repository audit. Do not hand-edit the generated graph to silence CI.

These repository content/topology checks are specific to the upstream `@steadystack/source` template. Initialized products retain the checker unit tests but intentionally skip the upstream repository audit; adopters should add product-specific documentation rules if they want an equivalent downstream contract.

## Inspect Playwright evidence

The browser configuration retains traces, screenshots, video, and the HTML report only when useful for failures.

Open a retained trace:

```bash
pnpm exec playwright show-trace path/to/trace.zip
```

Open an extracted HTML report:

```bash
pnpm exec playwright show-report path/to/playwright-report
```

Start with the first failed action, then inspect:

- the page URL and request failures;
- console errors;
- DOM snapshots before and after the failed action;
- screenshots and video for timing or layout symptoms;
- trace network events for API, authentication, and CORS failures.

Reproduce the focused browser target locally:

```bash
pnpm nx run web-feature-agent-tasks:e2e
```

## Read preview service logs

`service-logs.txt` is captured with the repository's preview Compose file after a Delivery failure. Search from the earliest unhealthy service rather than the last cascading error.

```bash
grep -nE 'error|fatal|unhealthy|refused|timeout|migration|401|403|429|503' service-logs.txt
```

Reproduce with the same production-shaped local lifecycle:

```bash
pnpm preview:up
pnpm preview:smoke
pnpm performance:load
pnpm preview:down
```

For an active failed preview, capture logs locally before teardown:

```bash
docker compose \
  --env-file infra/environments/preview.local.env \
  -f infra/deploy/compose.preview.yaml \
  logs --no-color
```

## Interpret performance JSON

`performance-report.json` is the machine-readable result produced by the load-test command. Compare the failing scenario with the checked-in performance budget and console summary.

```bash
jq . performance-report.json
pnpm performance:check
```

Investigate error rate before latency when requests failed. For a latency-only failure, correlate the scenario window with preview service logs and rerun the same local preview rather than weakening the budget to make CI green.

## Inspect generated-workspace diagnostics

The generated-workspace bundle comes from the temporary generated repository, not the template checkout. Preserve its directory structure when extracting it.

Use the failed workflow step to choose the first relevant evidence:

- initialization or identity output for template-generation failures;
- install output for lockfile or package-manager failures;
- validation output for lint, typecheck, test, or build failures;
- preview logs and performance JSON for generated delivery failures;
- working-tree status or diff output for nondeterministic generation.

Reproduce from a clean temporary directory with the documented generated-workspace lifecycle. Do not rely on an existing product checkout whose application-owned changes can mask template behavior.

## Inspect the generated release plan

The CI bundle stores `release-plan.json` in the diagnostic directory. Inspect the whole file and verify its environment, version, image references, source revision, and browser build inputs match the failed run.

```bash
jq . release-plan.json
pnpm release:plan
pnpm release:manifest:check
```

A release-plan failure is metadata or policy evidence. It does not mean an image was deployed.

## BuildKit cache behavior

Delivery restores `.cache/buildkit`. Generated workspace restores the sibling path `../buildkit-cache` and sets `BUILDKIT_CACHE_DIR` to that location so the cache remains outside the temporary generated repository. Both workflows enable cache-aware `docker buildx build --load` execution explicitly.

The cache is an optimization only:

- restore failures are non-blocking;
- each service has a separate cache scope;
- cache export writes a next directory before replacing the current cache;
- deleting the cache must affect speed, not Dockerfile selection, build arguments, tags, or image correctness.

Reproduce without cache:

```bash
rm -rf .cache/buildkit ../buildkit-cache
unset BUILDKIT_CACHE_ENABLED
unset BUILDKIT_CACHE_DIR
pnpm containers:build
```

A failure that disappears only with a warm cache indicates an implementation defect. Do not treat a cache as a required build input.

## Deterministic local fallback sequence

Use the smallest command that matches the failed operation, then expand only as needed:

```bash
pnpm install --frozen-lockfile
pnpm docs:architecture
pnpm docs:check
pnpm delivery:check
pnpm nx run web-feature-agent-tasks:e2e
pnpm containers:build
pnpm preview:up
pnpm preview:smoke
pnpm performance:load
pnpm preview:down
pnpm check
```

Record the exact command, environment overrides, source SHA, and whether either BuildKit cache path was present.

## Related pages

- [Validation and Testing](Validation-and-Testing)
- [Containers and Preview Environments](Containers-and-Preview-Environments)
- [Troubleshooting](Troubleshooting)
- [Repository and GitHub Setup](Repository-and-GitHub-Setup)

[Back to Home](Home)
