import type { Tree } from '@nx/devkit';

import {
  createLibraryProject,
  formatGeneratorFiles,
  normalizeGeneratorName,
} from '../shared';
import type { DomainGeneratorSchema } from './schema';

export default async function domainGenerator(
  tree: Tree,
  schema: DomainGeneratorSchema,
): Promise<void> {
  const name = normalizeGeneratorName(schema.name);
  const projectRoot = `packages/backend/${name.fileName}`;

  createLibraryProject(tree, {
    importPath: `@agentic-webapp/backend-${name.fileName}`,
    projectName: `backend-${name.fileName}`,
    projectRoot,
    tags: ['scope:backend', 'type:domain', 'runtime:node'],
  });

  tree.write(
    `${projectRoot}/src/lib/domain/${name.fileName}.ts`,
    `export interface ${name.className} {\n  readonly id: string;\n  readonly createdAt: Date;\n}\n\nexport interface Create${name.className}Input {\n  readonly id: string;\n}\n\nexport function create${name.className}(\n  input: Create${name.className}Input,\n): ${name.className} {\n  return {\n    id: input.id,\n    createdAt: new Date(),\n  };\n}\n`,
  );
  tree.write(
    `${projectRoot}/src/lib/application/${name.fileName}-repository.ts`,
    `import type { ${name.className} } from '../domain/${name.fileName}';\n\nexport interface ${name.className}Repository {\n  save(entity: ${name.className}): Promise<void>;\n}\n`,
  );
  tree.write(
    `${projectRoot}/src/lib/application/create-${name.fileName}.ts`,
    `import { create${name.className}, type Create${name.className}Input, type ${name.className} } from '../domain/${name.fileName}';\nimport type { ${name.className}Repository } from './${name.fileName}-repository';\n\nexport class Create${name.className} {\n  public constructor(private readonly repository: ${name.className}Repository) {}\n\n  public async execute(input: Create${name.className}Input): Promise<${name.className}> {\n    const entity = create${name.className}(input);\n    await this.repository.save(entity);\n    return entity;\n  }\n}\n`,
  );
  tree.write(
    `${projectRoot}/src/lib/application/create-${name.fileName}.spec.ts`,
    `import { describe, expect, it, vi } from 'vitest';\n\nimport { Create${name.className} } from './create-${name.fileName}';\n\ndescribe('Create${name.className}', () => {\n  it('creates and persists the domain entity', async () => {\n    const save = vi.fn().mockResolvedValue(undefined);\n    const useCase = new Create${name.className}({ save });\n\n    const result = await useCase.execute({ id: 'example-id' });\n\n    expect(result.id).toBe('example-id');\n    expect(save).toHaveBeenCalledWith(result);\n  });\n});\n`,
  );
  tree.write(
    `${projectRoot}/src/index.ts`,
    `export * from './lib/application/create-${name.fileName}';\nexport * from './lib/application/${name.fileName}-repository';\nexport * from './lib/domain/${name.fileName}';\n`,
  );
  tree.write(
    `${projectRoot}/README.md`,
    `# ${name.className} domain\n\nOwns the ${name.propertyName} domain model and application use cases. Framework adapters belong outside the domain layer and must depend on this public API only.\n`,
  );
  tree.write(
    `${projectRoot}/AGENTS.md`,
    `# ${name.className} domain guidance\n\n- Keep domain and application code framework-free.\n- Expose cross-project behavior through src/index.ts only.\n- Add infrastructure adapters in a separate data-access project when persistence is introduced.\n- Test invariants and use cases without network or database dependencies.\n`,
  );

  await formatGeneratorFiles(tree, schema.skipFormat);
}
