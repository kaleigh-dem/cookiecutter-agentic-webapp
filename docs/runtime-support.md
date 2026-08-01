# Node.js runtime support

## Supported baseline

Node.js 24 LTS is the required runtime for local development, continuous integration, release tooling, and production images. The workspace uses pnpm 10.13.1 through the `packageManager` field and CI setup actions.

The runtime baseline is recorded in these locations:

- `package.json` limits the supported Node.js engine to the 24.x release line.
- `.node-version` pins the local developer runtime to a tested Node.js 24 patch release.
- GitHub Actions use Node.js 24 for validation, delivery, and release workflows.
- Production Dockerfiles default the `NODE_VERSION` build argument to 24 for build and runtime stages.

Use a version manager that reads `.node-version`, or install the same Node.js release directly, before running `corepack enable` and `pnpm install`.

## Compatibility lane

CI includes a non-blocking Node.js 26 job while that even-numbered release is the current release line. It runs dependency installation, contract generation, workspace synchronization, type checking, unit and integration tests, and production builds.

This lane is early-warning coverage only. A passing result does not make Node.js 26 a supported production runtime, and a failure does not block changes that pass the Node.js 24 baseline.

## Upgrade policy

- Production and developer baselines use an Active LTS or Maintenance LTS Node.js release; odd-numbered and end-of-life releases are not supported.
- The baseline moves to the next release only after it reaches LTS and the full validation contract passes, including Playwright, Testcontainers-backed integration tests, production image builds, preview smoke tests, and release-plan generation.
- CI and Docker images track the supported major release so they receive compatible security and patch updates.
- `.node-version` records a specific tested patch release and should be refreshed when the baseline patch is updated.
- When the baseline changes, update all runtime pins and this document in the same pull request.

The authoritative Node.js lifecycle is the upstream release schedule: https://nodejs.org/en/about/previous-releases

## Validation coverage

The required Node.js 24 path is exercised through:

- `.github/workflows/ci.yml` for install, contracts, synchronization, formatting, delivery policy, release-plan generation, type checking, workspace builds, Playwright, generated-output validation, linting, and tests including Testcontainers-backed database coverage.
- `.github/workflows/delivery.yml` for production image builds, migrations, preview startup, smoke checks, performance budgets, and teardown.
- `.github/workflows/release.yml` for release-plan generation and versioned production image builds.

Local validation uses `pnpm check`. Container and preview validation uses `pnpm containers:build` or `pnpm preview:up` followed by `pnpm preview:down`.
