# Template releases

Template releases publish the Nx workspace plugin as an installable npm tarball attached to a tagged GitHub Release. The release artifact is the stable distribution channel used by generated-workspace CI and downstream initialization.

## Versioning policy

Template versions follow semantic versioning:

- **Major** versions change the generated-workspace contract incompatibly, remove supported profiles, or require a downstream migration before existing generated repositories can consume the release.
- **Minor** versions add backward-compatible generator options, profiles, project types, or generated capabilities.
- **Patch** versions fix generation, validation, documentation, or release behavior without changing the supported generated-workspace contract.
- Prereleases use identifiers such as `1.2.0-rc.1`. Build metadata is allowed for local verification but should not be used for public release tags.

Every public release uses the `template-v<version>` tag format and includes a matching section in `CHANGELOG.md`.

## Preparing a release

Run the preparation command on a branch:

```bash
pnpm template:release:prepare -- --version 0.2.0
pnpm install --lockfile-only
pnpm format
pnpm template:release:verify -- --version 0.2.0
```

The preparation command updates the root package version, workspace-plugin package version, generator version source, and changelog. Review the generated changelog entries before merging the release preparation PR.

## Publishing a release

After the release preparation PR is merged, run the **Release template** workflow from `main` with the prepared version. The workflow:

1. verifies version and changelog consistency;
2. builds and packs the workspace plugin;
3. installs the local tarball and invokes the `preset` entry point;
4. creates a draft `template-v<version>` GitHub Release and uploads the tarball;
5. downloads and installs the draft release artifact;
6. uses the downloaded artifact to generate an independently named repository;
7. runs the generated repository's frozen install, validation, migration, seed, preview, smoke, performance, teardown, identity, and cleanliness checks;
8. publishes the release only after the complete generated-workspace lifecycle passes.

A failed artifact smoke test or generated-workspace lifecycle deletes the draft release and its tag. Compose logs from generated-workspace failures are uploaded as a short-lived workflow artifact.

## Consuming a release

Download the tarball attached to the desired `template-v<version>` GitHub Release and install it as a development dependency. Then invoke the preset:

```bash
pnpm add -D ./agentic-webapp-workspace-plugin-0.1.0.tgz
pnpm nx g @agentic-webapp/workspace-plugin:preset my-application \
  --packageScope=@my-org \
  --repositoryOwner=my-org
```

Generated repositories record the originating release in `workspace.template.json` under `upstream.version`. Template-maintainer release and generated-workspace validation scripts, workflows, and documentation are removed during initialization so downstream repositories cannot accidentally operate the upstream template lifecycle.

See `docs/template-validation.md` for the generated profile, lifecycle contract, diagnostics, and local command.
