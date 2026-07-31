import type { Tree } from '@nx/devkit';

import {
  appendBarrelExport,
  assertPathAvailable,
  formatGeneratorFiles,
  normalizeGeneratorName,
} from '../shared';
import type { ContractGeneratorSchema } from './schema';

export default async function contractGenerator(
  tree: Tree,
  schema: ContractGeneratorSchema,
): Promise<void> {
  const name = normalizeGeneratorName(schema.name);
  const contractRoot = `packages/contracts/src/${name.fileName}`;

  assertPathAvailable(tree, `${contractRoot}/schema.ts`);

  tree.write(
    `${contractRoot}/schema.ts`,
    `import { z } from 'zod';\n\nexport const ${name.propertyName}Schema = z.object({\n  id: z.string().min(1),\n  occurredAt: z.string().datetime(),\n});\n\nexport type ${name.className} = z.infer<typeof ${name.propertyName}Schema>;\n`,
  );
  tree.write(
    `${contractRoot}/schema.spec.ts`,
    `import { describe, expect, it } from 'vitest';\n\nimport { ${name.propertyName}Schema } from './schema';\n\ndescribe('${name.propertyName}Schema', () => {\n  it('accepts a valid payload', () => {\n    expect(\n      ${name.propertyName}Schema.parse({\n        id: 'example-id',\n        occurredAt: new Date().toISOString(),\n      }).id,\n    ).toBe('example-id');\n  });\n});\n`,
  );
  tree.write(`${contractRoot}/index.ts`, `export * from './schema';\n`);
  tree.write(
    `${contractRoot}/README.md`,
    `# ${name.className} contract\n\nThis schema is the runtime and TypeScript source of truth for the ${name.propertyName} payload. Additive changes are preferred; breaking changes require explicit versioning.\n`,
  );

  appendBarrelExport(
    tree,
    'packages/contracts/src/index.ts',
    `./${name.fileName}`,
  );
  await formatGeneratorFiles(tree, schema.skipFormat);
}
