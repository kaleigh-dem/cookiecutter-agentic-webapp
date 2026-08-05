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

const browserEnvironmentScenarios = new Map([
  [
    'NEXT_PUBLIC_API_BASE_URL',
    'public browser API base URL changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_AUTHENTICATION_PROFILE',
    'public browser authentication profile changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT',
    'public browser authentication session endpoint changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS',
    'public browser authentication refresh skew changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_OTEL_DEPLOYMENT_ENVIRONMENT',
    'public browser telemetry deployment environment changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT',
    'public browser telemetry OTLP endpoint changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    'public browser telemetry OTLP traces endpoint changes invalidate browser outputs',
  ],
  [
    'NEXT_PUBLIC_OTEL_SDK_DISABLED',
    'public browser telemetry disable flag changes invalidate browser outputs',
  ],
]);

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

  it('fails when any public browser build variable is omitted', async () => {
    if (!hasSourceWorkflowContracts) return;

    const configuration = await loadConfiguration();

    for (const [env, scenarioName] of browserEnvironmentScenarios) {
      const mutated = clone(configuration);
      mutated.nx.namedInputs.browserEnvironment =
        mutated.nx.namedInputs.browserEnvironment.filter(
          (input) => input.env !== env,
        );

      const result = auditConfiguration(mutated);

      expect(result.ok).toBe(false);
      expect(result.failures).toContain(
        `${scenarioName}: web:build was not invalidated`,
      );
      expect(result.failures).toContain(
        `${scenarioName}: web:container was not invalidated`,
      );
    }
  });

  it('fails when workspace plugin build omits template upgrade inputs', async () => {
    if (!hasSourceWorkflowContracts) return;

    const configuration = await loadConfiguration();
    const mutated = clone(configuration);
    mutated.projects['tools/workspace-plugin'].targets.build.inputs = [
      'production',
      '^production',
    ];

    const result = auditConfiguration(mutated);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      'template upgrade assets invalidate workspace plugin release build: workspace-plugin:build was not invalidated',
    );
  });

  it('fails when repository generator defaults are removed', async () => {
    if (!hasSourceWorkflowContracts) return;

    const configuration = await loadConfiguration();
    const mutated = clone(configuration);
    delete mutated.nx.generators;

    const result = auditConfiguration(mutated);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      'Nx configuration: Next application generator defaults changed',
    );
    expect(result.failures).toContain(
      'Nx configuration: Nest application generator defaults changed',
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
