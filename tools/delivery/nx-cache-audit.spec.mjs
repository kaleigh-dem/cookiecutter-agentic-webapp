import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditConfiguration,
  loadAuditConfiguration,
} from './nx-cache-audit.mjs';

const root = path.resolve('.');
const hasSourceWorkflowContracts = existsSync(
  path.join(root, '.github/workflows/generated-workspace.yml'),
);

async function loadConfiguration() {
  return loadAuditConfiguration(root);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('Nx cache input audit', () => {
  it('proves the checked-in invalidation and CI coverage fixtures', async () => {
    if (!hasSourceWorkflowContracts) return;

    const result = auditConfiguration(await loadConfiguration());

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('fails when a public browser build variable is omitted', async () => {
    if (!hasSourceWorkflowContracts) return;

    const configuration = await loadConfiguration();
    const mutated = clone(configuration);
    mutated.nx.namedInputs.browserEnvironment =
      mutated.nx.namedInputs.browserEnvironment.filter(
        (input) => input.env !== 'NEXT_PUBLIC_AUTHENTICATION_PROFILE',
      );

    const result = auditConfiguration(mutated);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      'public browser environment changes invalidate browser outputs: web:build was not invalidated',
    );
  });

  it('fails when required CI returns to full-workspace typecheck and build', async () => {
    if (!hasSourceWorkflowContracts) return;

    const configuration = await loadConfiguration();
    configuration.ciWorkflow = configuration.ciWorkflow.replace(
      'pnpm nx affected -t typecheck build --parallel=3',
      'pnpm typecheck\n      - run: pnpm build',
    );

    const result = auditConfiguration(configuration);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      'CI coverage: missing affected typecheck and build',
    );
  });
});
