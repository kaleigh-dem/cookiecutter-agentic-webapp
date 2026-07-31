import type { Tree } from '@nx/devkit';

import {
  createLibraryProject,
  formatGeneratorFiles,
  normalizeGeneratorName,
} from '../shared';
import type { FeatureGeneratorSchema } from './schema';

export default async function featureGenerator(
  tree: Tree,
  schema: FeatureGeneratorSchema,
): Promise<void> {
  const name = normalizeGeneratorName(schema.name);
  const projectRoot = `packages/web/features/${name.fileName}`;

  createLibraryProject(tree, {
    dependencies: { react: '^19.0.0' },
    importPath: `@agentic-webapp/web-feature-${name.fileName}`,
    jsx: true,
    projectName: `web-feature-${name.fileName}`,
    projectRoot,
    tags: ['scope:web', 'type:feature', 'runtime:browser'],
  });

  tree.write(
    `${projectRoot}/src/lib/${name.fileName}-model.ts`,
    `export interface ${name.className}ViewModel {\n  readonly heading: string;\n  readonly description: string;\n}\n\nexport function create${name.className}ViewModel(): ${name.className}ViewModel {\n  return {\n    heading: '${name.className}',\n    description: 'Replace this placeholder with feature-specific state.',\n  };\n}\n`,
  );
  tree.write(
    `${projectRoot}/src/lib/${name.fileName}-model.spec.ts`,
    `import { describe, expect, it } from 'vitest';\n\nimport { create${name.className}ViewModel } from './${name.fileName}-model';\n\ndescribe('create${name.className}ViewModel', () => {\n  it('returns a stable initial model', () => {\n    expect(create${name.className}ViewModel().heading).toBe('${name.className}');\n  });\n});\n`,
  );
  tree.write(
    `${projectRoot}/src/lib/${name.fileName}-feature.tsx`,
    `import { create${name.className}ViewModel } from './${name.fileName}-model';\n\nexport function ${name.className}Feature() {\n  const model = create${name.className}ViewModel();\n\n  return (\n    <section aria-labelledby="${name.fileName}-heading">\n      <h2 id="${name.fileName}-heading">{model.heading}</h2>\n      <p>{model.description}</p>\n    </section>\n  );\n}\n`,
  );
  tree.write(
    `${projectRoot}/src/index.ts`,
    `export * from './lib/${name.fileName}-feature';\nexport * from './lib/${name.fileName}-model';\n`,
  );
  tree.write(
    `${projectRoot}/README.md`,
    `# ${name.className} feature\n\nOwns the browser-facing ${name.propertyName} feature. Routes should compose this package through its public API rather than implementing feature logic directly.\n`,
  );
  tree.write(
    `${projectRoot}/AGENTS.md`,
    `# ${name.className} feature guidance\n\n- Keep route files thin and place feature behavior here.\n- Do not import Node-only projects.\n- Keep network access behind typed client functions.\n- Export only supported entry points from src/index.ts.\n- Add accessible states for loading, empty, error, and success behavior.\n`,
  );

  await formatGeneratorFiles(tree, schema.skipFormat);
}
