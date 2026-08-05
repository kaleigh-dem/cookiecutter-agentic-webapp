import { describe, expect, it } from 'vitest';

import { createReleasePlan } from './release-plan.mjs';

describe('release plan', () => {
  it.each(['preview', 'production'] as const)(
    'keeps %s release smoke on the generic profile',
    (environment) => {
      const plan = createReleasePlan({
        environment,
        imagePrefix: 'registry.example.com/steadystack',
        version: environment === 'preview' ? '1.2.3-rc.1' : '1.2.3',
      });
      const smokeStep = plan.orderedSteps.find(
        (step: { id: string }) => step.id === 'smoke-test',
      );

      expect(smokeStep).toEqual({
        id: 'smoke-test',
        command: `set -a && . infra/environments/${environment}.env && set +a && node tools/delivery/smoke-test.mjs --profile release`,
      });
    },
  );
});
