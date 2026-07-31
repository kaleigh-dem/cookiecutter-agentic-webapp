import type { Tree } from '@nx/devkit';

import {
  appendBarrelExport,
  assertPathAvailable,
  formatGeneratorFiles,
  normalizeGeneratorName,
} from '../shared';
import type { JobGeneratorSchema } from './schema';

export default async function jobGenerator(
  tree: Tree,
  schema: JobGeneratorSchema,
): Promise<void> {
  const name = normalizeGeneratorName(schema.name);
  const queue = schema.queue?.trim() || 'default';
  const jobRoot = `apps/worker/src/jobs/${name.fileName}`;

  assertPathAvailable(tree, `${jobRoot}/handler.ts`);

  tree.write(
    `${jobRoot}/contract.ts`,
    `export const ${name.propertyName}Queue = '${queue}' as const;\n\nexport interface ${name.className}JobPayload {\n  readonly correlationId: string;\n}\n\nexport interface ${name.className}JobResult {\n  readonly correlationId: string;\n  readonly completedAt: string;\n}\n`,
  );
  tree.write(
    `${jobRoot}/handler.ts`,
    `import type { ${name.className}JobPayload, ${name.className}JobResult } from './contract';\n\nexport async function handle${name.className}Job(\n  payload: ${name.className}JobPayload,\n): Promise<${name.className}JobResult> {\n  return {\n    correlationId: payload.correlationId,\n    completedAt: new Date().toISOString(),\n  };\n}\n`,
  );
  tree.write(
    `${jobRoot}/handler.spec.ts`,
    `import { describe, expect, it } from 'vitest';\n\nimport { handle${name.className}Job } from './handler';\n\ndescribe('handle${name.className}Job', () => {\n  it('preserves the correlation identifier', async () => {\n    const result = await handle${name.className}Job({ correlationId: 'test-id' });\n\n    expect(result.correlationId).toBe('test-id');\n  });\n});\n`,
  );
  tree.write(
    `${jobRoot}/index.ts`,
    `export * from './contract';\nexport * from './handler';\n`,
  );
  tree.write(
    `${jobRoot}/README.md`,
    `# ${name.className} job\n\nQueue: \`${queue}\`. Keep transport-specific registration in the worker composition root and keep the handler independently testable.\n`,
  );
  tree.write(
    `${jobRoot}/AGENTS.md`,
    `# ${name.className} job guidance\n\n- Treat payloads as versioned contracts.\n- Preserve correlation identifiers in logs and downstream calls.\n- Make retries idempotent before enabling automatic retry behavior.\n- Keep queue clients out of the handler's core logic.\n`,
  );

  appendBarrelExport(
    tree,
    'apps/worker/src/jobs/index.ts',
    `./${name.fileName}`,
  );
  await formatGeneratorFiles(tree, schema.skipFormat);
}
