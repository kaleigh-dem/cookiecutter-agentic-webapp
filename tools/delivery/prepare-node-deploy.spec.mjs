import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  deploymentWorkspacePackages,
  rewriteModuleSpecifiers,
} from './prepare-node-deploy.mjs';

describe('Node deployment module normalization', () => {
  it('stages the compiled rate-limit package for every database consumer', () => {
    for (const serviceName of ['api', 'worker']) {
      expect(deploymentWorkspacePackages(serviceName)).toContain(
        'packages/backend/rate-limit',
      );
    }
  });

  it('adds resolvable extensions to emitted relative module specifiers', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'delivery-modules-'));
    const sourceDirectory = path.join(directory, 'lib');
    const sourceFile = path.join(sourceDirectory, 'index.js');

    try {
      await mkdir(path.join(sourceDirectory, 'directory'), { recursive: true });
      await writeFile(path.join(sourceDirectory, 'value.js'), 'export {};\n');
      await writeFile(
        path.join(sourceDirectory, 'directory', 'index.js'),
        'export {};\n',
      );
      await writeFile(
        path.join(sourceDirectory, 'side-effect.js'),
        'export {};\n',
      );
      await writeFile(path.join(directory, 'shared.js'), 'export {};\n');
      await writeFile(path.join(sourceDirectory, 'data.json'), '{}\n');

      const content = [
        "import { value } from './value';",
        "export * from './directory';",
        "const lazy = import('../shared');",
        "import './side-effect';",
        "import external from '@scope/external';",
        "import data from './data.json';",
        "const ordinaryString = './value';",
      ].join('\n');

      await expect(rewriteModuleSpecifiers(sourceFile, content)).resolves.toBe(
        [
          "import { value } from './value.js';",
          "export * from './directory/index.js';",
          "const lazy = import('../shared.js');",
          "import './side-effect.js';",
          "import external from '@scope/external';",
          "import data from './data.json';",
          "const ordinaryString = './value';",
        ].join('\n'),
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects emitted relative imports that cannot be resolved', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'delivery-modules-'));
    const sourceFile = path.join(directory, 'index.js');

    try {
      await expect(
        rewriteModuleSpecifiers(sourceFile, "export * from './missing';"),
      ).rejects.toThrow('Unable to resolve emitted module specifier');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
