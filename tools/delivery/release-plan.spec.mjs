import { describe, expect, it } from 'vitest';

import { createReleasePlan, isSemanticVersion } from './release-plan.mjs';

describe('release planning', () => {
  it('accepts semantic versions and rejects incomplete versions', () => {
    expect(isSemanticVersion('1.2.3')).toBe(true);
    expect(isSemanticVersion('1.2.3-preview.1')).toBe(true);
    expect(isSemanticVersion('1.2')).toBe(false);
  });

  it('orders migrations before service deployment', () => {
    const plan = createReleasePlan({
      environment: 'production',
      imagePrefix: 'ghcr.io/example/agentic-webapp',
      version: '1.2.3',
    });
    const identifiers = plan.orderedSteps.map((step) => step.id);

    expect(identifiers.indexOf('capture-backup')).toBeLessThan(
      identifiers.indexOf('apply-migrations'),
    );
    expect(identifiers.indexOf('apply-migrations')).toBeLessThan(
      identifiers.indexOf('deploy-services'),
    );
    expect(plan.images.api).toBe('ghcr.io/example/agentic-webapp/api:1.2.3');
  });
});
