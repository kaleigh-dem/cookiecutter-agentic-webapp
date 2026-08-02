# Template upgrades

Generated repositories record their originating release in `workspace.template.json`. Upgrade commands read that version, select an ordered migration path, and print every planned file operation before changing the repository.

## Preview an upgrade

Download the workspace-plugin tarball attached to the target template release and install it temporarily:

```bash
pnpm add --save-dev ./downloaded-workspace-plugin-<version>.tgz
pnpm exec agentic-webapp-upgrade --to <version> --dry-run
```

The command defaults to dry-run mode. Review the migration list, ownership class, action, and any conflicts in the JSON report.

## Apply an upgrade

Commit or stash current work, then run:

```bash
pnpm exec agentic-webapp-upgrade --to <version> --apply
pnpm check
```

The applied migration synchronizes the repository-local runner under `tools/template/`, so the temporary release package can be removed after validation if it is not otherwise required.

## Ownership and conflicts

- **Template-managed** files are upgrade infrastructure and may be replaced by a verified release artifact.
- **Generated-once** files receive only explicit structured edits or are created when absent. Customized content is not replaced silently.
- **Application-owned** files are never overwritten automatically. Migrations report manual follow-up when product code or deployment configuration must change.

Resolve reported conflicts manually, rerun the dry run, and commit the upgrade separately from unrelated application changes. The complete machine-readable policy is in `tools/template/ownership.json`.
