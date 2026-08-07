import { describe, expect, it } from 'vitest';

import {
  createWorkspaceManifest,
  normalizeInitOptions,
} from './generator';
import type { InitGeneratorSchema } from './schema';

const baseOptions: InitGeneratorSchema = {
  applicationSlug: 'customer-portal',
  packageScope: '@acme',
  repositoryOwner: 'acme-platform',
  applications: 'web,api',
  authentication: 'none',
  workerTransport: 'none',
  deploymentProfile: 'containers',
  skipFormat: true,
};

describe('optional AI profile boundary', () => {
  it('keeps the profile disabled by default and declarative when enabled', () => {
    const defaultOptions = normalizeInitOptions(baseOptions);
    const enabledOptions = normalizeInitOptions({ ...baseOptions, ai: true });

    expect(defaultOptions.ai).toBe(false);
    expect(enabledOptions.ai).toBe(true);

    const defaultManifest = createWorkspaceManifest(defaultOptions);
    const enabledManifest = createWorkspaceManifest(enabledOptions);

    expect(enabledManifest).toEqual({
      ...defaultManifest,
      profiles: {
        ...defaultManifest.profiles,
        ai: true,
      },
    });
  });

  it('does not make coding-agent compatibility depend on the runtime AI opt-in', () => {
    const manifest = createWorkspaceManifest(normalizeInitOptions(baseOptions));

    expect(manifest.profiles.ai).toBe(false);
    expect(manifest.applications).toEqual(['web', 'api']);
  });
});
