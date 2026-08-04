# Template releases

Template releases publish the Nx workspace plugin as an installable npm tarball attached to a tagged GitHub Release. The release artifact is the stable distribution channel used by generated-workspace CI, downstream initialization, and versioned upgrades.

## Versioning policy

Template versions follow semantic versioning:

- **Major** versions change the generated-workspace contract incompatibly, remove supported profiles, or require a downstream migration before existing generated repositories can consume the release.
- **Minor** versions add backward-compatible generator options, profiles, project types, generated capabilities, or migration tooling.
- **Patch** versions fix generation, validation, documentation, migration implementation, or release behavior without changing the supported generated-workspace contract.
- Prereleases use identifiers such as `1.2.0-rc.1`. Build metadata is allowed for local verification but should not be used for public release tags.

Every public release uses the `template-v<version>` tag format and includes a matching section in `CHANGELOG.md`.

## Preparing a release

Choose the target version once and use it for every preparation and verification step:

```bash
version=<target-version>
pnpm template:release:prepare -- --version "$version"
pnpm install --lockfile-only
pnpm format
pnpm template:release:verify -- --version "$version"
```

The preparation command updates the root package version, workspace-plugin package version, generator version source, and changelog. Review the generated changelog entries before merging the release preparation PR. A release that changes downstream behavior must also include an ordered migration from the previous public template version or document why no migration is required.

## Publishing a release

After the release preparation PR is merged, run the **Release template** workflow from `main` with the prepared version. The workflow:

1. verifies version and changelog consistency;
2. builds and packs the workspace plugin, including the upgrade binary and migration assets;
3. installs the local tarball, invokes the `preset` entry point, and upgrades the previous-release fixture;
4. creates a draft `template-v<version>` GitHub Release and uploads the tarball;
5. downloads and installs the draft release artifact;
6. repeats the preset and previous-release upgrade smoke against the downloaded artifact;
7. uses the downloaded artifact to generate an independently named repository;
8. runs the generated repository's frozen install, validation, migration, seed, preview, smoke, performance, teardown, identity, and cleanliness checks;
9. publishes the release only after the artifact and complete generated-workspace lifecycle pass.

A failed artifact smoke test, upgrade fixture, or generated-workspace lifecycle deletes the draft release and its tag. Compose logs from generated-workspace failures are uploaded as a short-lived workflow artifact.

## Consuming a release

Download the tarball attached to the desired `template-v<version>` GitHub Release and install it as a development dependency. Then invoke the preset:

```bash
version=<target-version>
pnpm add -D "./agentic-webapp-workspace-plugin-${version}.tgz"
pnpm nx g @agentic-webapp/workspace-plugin:preset my-application \
  --packageScope=@my-org \
  --repositoryOwner=my-org
```

Generated repositories record the originating release in `workspace.template.json` under `upstream.version`. Template-maintainer release and generated-workspace validation scripts, workflows, fixtures, and documentation are removed during initialization. Downstream upgrade tooling and its ownership policy remain available.

See `docs/template-validation.md` for the generated profile and lifecycle contract. See `docs/template-upgrades.md` for dry-run, apply, ownership, and conflict-handling guidance.
