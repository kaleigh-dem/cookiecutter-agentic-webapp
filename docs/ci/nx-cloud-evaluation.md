# Nx Cloud evaluation

## Current decision

Defer adoption.

The checked-in baseline comes from CI run #235 on August 1, 2026. Its single `affected` job completed in approximately 144 seconds with one active pull-request workload. Within that sample, typechecking took 11.4 seconds, builds 8.6 seconds, authenticated E2E 6.1 seconds, generated-output validation 27.5 seconds, and affected lint/tests 20.8 seconds.

One sample is not a trend. The repository records it to make the next decision evidence-based rather than to claim a stable percentile.

## Re-evaluation thresholds

Run `node tools/delivery/evaluate-nx-cloud.mjs` whenever `infra/ci/baseline.json` is updated. Start a time-boxed Nx Cloud trial when any condition is met:

- median end-to-end CI reaches 600 seconds;
- P95 end-to-end CI reaches 900 seconds;
- peak concurrent pull requests reaches three.

Before a trial, collect at least 20 representative successful runs and separate queue time from execution time. During a trial, compare wall-clock duration, cache hit rate, developer wait time, reliability, administrative overhead, and cost. Retain the local task graph and CI fallback so a remote-cache outage does not block releases.

## Why not now

The measured workflow is well below the duration thresholds, and team concurrency is below the distribution threshold. The largest deterministic task is the generated-output smoke test, which does not currently justify an external service by itself. Local Nx caching and GitHub's package cache remain sufficient at the current scale.
