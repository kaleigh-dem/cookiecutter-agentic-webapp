import { readJson, type Tree, writeJson } from '@nx/devkit';

import { templateVersion } from '../../template-version';
import initGenerator from '../init/generator';
import type { InitGeneratorSchema } from '../init/schema';
import { formatGeneratorFiles } from '../shared';

const templateMaintainerPaths = [
  '.github/workflows/generated-workspace.yml',
  '.github/workflows/template-release.yml',
  'CHANGELOG.md',
  'docs/template-releases.md',
  'docs/template-validation.md',
  'tools/template/fixtures',
  'tools/template/generated-workspace-e2e.mjs',
  'tools/template/release.mjs',
  'tools/template/smoke-release-artifact.mjs',
] as const;

const templateMaintainerScripts = [
  'template:release:prepare',
  'template:release:verify',
  'template:release:pack',
  'template:release:notes',
  'template:release:smoke',
  'template:workspace:e2e',
] as const;

interface WorkspaceManifest {
  readonly [key: string]: unknown;
  readonly upstream?: Record<string, unknown>;
}

interface PackageJson {
  readonly [key: string]: unknown;
  readonly scripts?: Record<string, string>;
}

function removeTreePath(tree: Tree, path: string): void {
  if (tree.read(path) !== null) {
    tree.delete(path);
    return;
  }

  for (const child of tree.children(path)) {
    removeTreePath(tree, `${path}/${child}`);
  }
}

function recordTemplateVersion(tree: Tree): void {
  const manifest = readJson<WorkspaceManifest>(tree, 'workspace.template.json');
  writeJson(tree, 'workspace.template.json', {
    ...manifest,
    schemaVersion: 2,
    upstream: {
      ...(manifest.upstream ?? {}),
      version: templateVersion,
    },
    upgrade: {
      ownershipPolicyVersion: 1,
    },
  });
}

function removeTemplateMaintainerFiles(tree: Tree): void {
  for (const path of templateMaintainerPaths) {
    removeTreePath(tree, path);
  }
}

function removeTemplateMaintainerScripts(tree: Tree): void {
  if (!tree.exists('package.json')) return;

  const packageJson = readJson<PackageJson>(tree, 'package.json');
  const scripts = { ...(packageJson.scripts ?? {}) };
  for (const script of templateMaintainerScripts) {
    delete scripts[script];
  }
  writeJson(tree, 'package.json', { ...packageJson, scripts });
}

function makeWorkspacePluginPrivate(tree: Tree): void {
  const path = 'tools/workspace-plugin/package.json';
  if (!tree.exists(path)) return;

  const packageJson = readJson<Record<string, unknown>>(tree, path);
  delete packageJson.publishConfig;
  writeJson(tree, path, {
    ...packageJson,
    private: true,
  });
}

export default async function presetGenerator(
  tree: Tree,
  schema: InitGeneratorSchema,
): Promise<void> {
  await initGenerator(tree, { ...schema, skipFormat: true });

  recordTemplateVersion(tree);
  removeTemplateMaintainerFiles(tree);
  removeTemplateMaintainerScripts(tree);
  makeWorkspacePluginPrivate(tree);

  await formatGeneratorFiles(tree, schema.skipFormat);
}
