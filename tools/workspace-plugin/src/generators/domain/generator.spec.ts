import { readProjectConfiguration, type Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import domainGenerator from './generator';

describe('domain generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    tree.write('tsconfig.json', '{"files":[],"references":[]}');
  });

  it('creates a tagged backend domain project', async () => {
    await domainGenerator(tree, { name: 'billing', skipFormat: true });

    const project = readProjectConfiguration(tree, 'backend-billing');
    expect(project.root).toBe('packages/backend/billing');
    expect(project.tags).toEqual([
      'scope:backend',
      'type:domain',
      'runtime:node',
    ]);
    expect(
      tree.exists(
        'packages/backend/billing/src/lib/application/create-billing.spec.ts',
      ),
    ).toBe(true);
  });
});
