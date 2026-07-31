import type { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import contractGenerator from './generator';

describe('contract generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write('packages/contracts/src/index.ts', '');
  });

  it('creates a schema and updates the contracts barrel', async () => {
    await contractGenerator(tree, {
      name: 'project created',
      skipFormat: true,
    });

    expect(
      tree.exists('packages/contracts/src/project-created/schema.spec.ts'),
    ).toBe(true);
    expect(tree.read('packages/contracts/src/index.ts', 'utf-8')).toContain(
      "export * from './project-created';",
    );
  });
});
