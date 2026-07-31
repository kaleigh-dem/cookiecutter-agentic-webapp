import type { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import jobGenerator from './generator';

describe('job generator', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('creates a worker job and updates the jobs barrel', async () => {
    await jobGenerator(tree, {
      name: 'refresh search index',
      queue: 'search',
      skipFormat: true,
    });

    expect(
      tree.exists('apps/worker/src/jobs/refresh-search-index/handler.spec.ts'),
    ).toBe(true);
    expect(tree.read('apps/worker/src/jobs/index.ts', 'utf-8')).toContain(
      "export * from './refresh-search-index';",
    );
  });
});
