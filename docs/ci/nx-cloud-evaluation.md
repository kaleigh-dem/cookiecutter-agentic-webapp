# Nx Cloud evaluation

## Current decision

Defer adoption.

The P13-04 checkpoint uses four successful pull-request CI runs attached to exact reviewed head SHAs across delivery, security, template, and application changes. Required `affected` jobs completed in 160.4, 169.0, 175.4, and 193.4 seconds. Using the evaluator's nearest-rank calculation, the median is 169 seconds and P95 is 193.4 seconds. Peak observed pull-request concurrency remained one.

Four runs are enough to replace the earlier one-run anecdote and validate the current affected-execution decision, but they are not a stable long-term percentile or the sample required for a remote-cache trial.

## Re-evaluation thresholds

Run `node tools/delivery/evaluate-nx-cloud.mjs` whenever `infra/ci/baseline.json` is updated. Start a time-boxed Nx Cloud trial when any condition is met:

- median end-to-end CI reaches 600 seconds;
- P95 end-to-end CI reaches 900 seconds;
- peak concurrent pull requests reaches three.

Before a trial, collect at least 20 representative successful runs attached to reviewed pull-request heads and separate queue time from execution time. During a trial, compare wall-clock duration, cache hit rate, developer wait time, reliability, administrative overhead, and cost. Retain the local task graph and CI fallback so a remote-cache outage does not block releases.

## Why not now

The measured workflow remains well below the duration thresholds, and team concurrency remains below the distribution threshold. Generator and generated-workspace validation remain explicit because they provide lifecycle coverage that affected application targets cannot replace. Local Nx caching and GitHub's package cache remain sufficient at the current scale.
