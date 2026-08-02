export default {
  id: '0.1.0-to-0.2.0',
  from: '0.1.0',
  to: '0.2.0',
  summary:
    'Install the downstream upgrade runner, ownership policy, and versioned migration metadata.',
  operations: [
    {
      type: 'merge-json',
      path: 'package.json',
      description: 'Expose the repository-local template upgrade command.',
      patch: {
        scripts: {
          'template:upgrade': 'node tools/template/upgrade.mjs',
        },
      },
    },
    {
      type: 'merge-json',
      path: 'workspace.template.json',
      description: 'Advance provenance and ownership metadata.',
      patch: {
        schemaVersion: 2,
        upstream: {
          version: '0.2.0',
        },
        upgrade: {
          ownershipPolicyVersion: 1,
          lastAppliedMigration: '0.1.0-to-0.2.0',
        },
      },
    },
    {
      type: 'create-file',
      path: 'docs/template-upgrades.md',
      description: 'Add downstream upgrade and conflict-resolution guidance.',
      content: `# Template upgrades

Generated repositories record their originating release in \`workspace.template.json\`. Upgrade commands read that version, select an ordered migration path, and print every planned file operation before changing the repository.

## Preview an upgrade

Download the workspace-plugin tarball attached to the target template release and install it temporarily:

\`\`\`bash
pnpm add --save-dev ./downloaded-workspace-plugin-<version>.tgz
pnpm exec agentic-webapp-upgrade --to <version> --dry-run
\`\`\`

The command defaults to dry-run mode. Review the migration list, ownership class, action, and any conflicts in the JSON report.

## Apply an upgrade

Commit or stash current work, then run:

\`\`\`bash
pnpm exec agentic-webapp-upgrade --to <version> --apply
pnpm check
\`\`\`

The applied migration synchronizes the repository-local runner under \`tools/template/\`, so the temporary release package can be removed after validation if it is not otherwise required.

## Ownership and conflicts

- **Template-managed** files are upgrade infrastructure and may be replaced by a verified release artifact.
- **Generated-once** files receive only explicit structured edits or are created when absent. Customized content is not replaced silently.
- **Application-owned** files are never overwritten automatically. Migrations report manual follow-up when product code or deployment configuration must change.

Resolve reported conflicts manually, rerun the dry run, and commit the upgrade separately from unrelated application changes.
`,
    },
  ],
};
