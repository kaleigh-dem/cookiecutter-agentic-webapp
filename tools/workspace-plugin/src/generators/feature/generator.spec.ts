import { readProjectConfiguration, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import featureGenerator from './generator';

describe('feature generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write('tsconfig.json', '{"files":[],"references":[]}');
  });

  it('creates a browser-only feature project', async () => {
    await featureGenerator(tree, {
      name: 'account settings',
      skipFormat: true,
    });

    const project = readProjectConfiguration(
      tree,
      'web-feature-account-settings',
    );
    expect(project.root).toBe('packages/web/features/account-settings');
    expect(project.tags).toContain('runtime:browser');
    expect(
      tree.exists(
        'packages/web/features/account-settings/src/lib/account-settings-feature.tsx',
      ),
    ).toBe(true);
  });
});
