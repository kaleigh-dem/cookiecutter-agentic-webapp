import { readJson, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import { templateVersion } from '../../template-version';
import { upstreamTemplateRepository } from '../../upstream-template';
import presetGenerator from './generator';

describe('preset generator', () => {
  it('records template provenance and removes maintainer-only tooling', async () => {
    const tree = createTreeWithEmptyWorkspace();
    writeJson(tree, 'package.json', {
      name: '@agentic-webapp/source',
      scripts: {
        'initialize:workspace': 'nx g @agentic-webapp/workspace-plugin:preset',
        'template:release:prepare': 'node tools/template/release.mjs prepare',
        'template:release:verify': 'node tools/template/release.mjs verify',
        'template:release:pack': 'node tools/template/release.mjs pack',
        'template:release:notes': 'node tools/template/release.mjs notes',
        'template:release:smoke':
          'node tools/template/smoke-release-artifact.mjs',
        'template:workspace:e2e':
          'node tools/template/generated-workspace-e2e.mjs',
      },
    });
    writeJson(tree, 'tools/workspace-plugin/package.json', {
      name: '@agentic-webapp/workspace-plugin',
      private: false,
      publishConfig: { access: 'public' },
    });
    tree.write('.github/workflows/generated-workspace.yml', 'name: e2e\n');
    tree.write('.github/workflows/template-release.yml', 'name: release\n');
    tree.write('CHANGELOG.md', '# Changelog\n');
    tree.write('docs/template-releases.md', '# Releases\n');
    tree.write('docs/template-validation.md', '# Validation\n');
    tree.write('tools/template/generated-workspace-e2e.mjs', 'export {};\n');
    tree.write('tools/template/release.mjs', 'export {};\n');
    tree.write('tools/template/smoke-release-artifact.mjs', 'export {};\n');

    await presetGenerator(tree, {
      applicationSlug: 'smoke-app',
      displayName: 'Smoke App',
      packageScope: '@smoke',
      repositoryOwner: 'smoke-owner',
      applications: 'web',
      authentication: 'none',
      workerTransport: 'none',
      deploymentProfile: 'local',
      skipFormat: true,
    });

    expect(
      readJson<{
        upstream: { repository: string; version: string };
      }>(tree, 'workspace.template.json').upstream,
    ).toEqual({
      repository: upstreamTemplateRepository,
      version: templateVersion,
    });

    const packageJson = readJson<{
      scripts: Record<string, string>;
    }>(tree, 'package.json');
    expect(packageJson.scripts['initialize:workspace']).toBe(
      'nx g @smoke/workspace-plugin:preset',
    );
    expect(
      Object.keys(packageJson.scripts).filter((script) =>
        script.startsWith('template:release:'),
      ),
    ).toEqual([]);
    expect(packageJson.scripts['template:workspace:e2e']).toBeUndefined();

    expect(tree.exists('.github/workflows/generated-workspace.yml')).toBe(
      false,
    );
    expect(tree.exists('.github/workflows/template-release.yml')).toBe(false);
    expect(tree.exists('CHANGELOG.md')).toBe(false);
    expect(tree.exists('docs/template-releases.md')).toBe(false);
    expect(tree.exists('docs/template-validation.md')).toBe(false);
    expect(tree.exists('tools/template/generated-workspace-e2e.mjs')).toBe(
      false,
    );
    expect(tree.exists('tools/template/release.mjs')).toBe(false);
    expect(tree.exists('tools/template/smoke-release-artifact.mjs')).toBe(
      false,
    );

    expect(
      readJson<{
        private: boolean;
        publishConfig?: unknown;
      }>(tree, 'tools/workspace-plugin/package.json'),
    ).toMatchObject({ private: true });
    expect(
      readJson<{ publishConfig?: unknown }>(
        tree,
        'tools/workspace-plugin/package.json',
      ).publishConfig,
    ).toBeUndefined();
  });
});
