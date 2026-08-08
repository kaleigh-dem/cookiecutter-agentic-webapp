import { describe, expect, it } from 'vitest';

import { parsePromptArtifact } from './prompt-artifact';
import { assertPromptArtifactRevision } from './prompt-revision';

const reviewedPrompt = parsePromptArtifact({
  schemaVersion: 1,
  id: 'revision-fixture',
  version: '1.0.0',
  kind: 'prompt',
  content: 'Original reviewed content.',
  variables: [],
  review: {
    status: 'approved',
    reviewer: 'repository-review',
    reviewedAt: '2026-08-08T00:00:00.000Z',
  },
});

describe('prompt artifact revisions', () => {
  it('requires a greater semantic version for behavior-bearing changes', () => {
    const sameVersion = parsePromptArtifact({
      ...reviewedPrompt,
      content: 'Changed reviewed content.',
    });
    expect(() =>
      assertPromptArtifactRevision(reviewedPrompt, sameVersion),
    ).toThrowError(/advance the semantic version/);

    const advancedVersion = parsePromptArtifact({
      ...sameVersion,
      version: '1.0.1',
    });
    expect(() =>
      assertPromptArtifactRevision(reviewedPrompt, advancedVersion),
    ).not.toThrow();
  });

  it('allows review-only changes without creating a behavior revision', () => {
    const rereviewed = parsePromptArtifact({
      ...reviewedPrompt,
      review: {
        status: 'approved',
        reviewer: 'second-reviewer',
        reviewedAt: '2026-08-08T01:00:00.000Z',
      },
    });
    expect(() =>
      assertPromptArtifactRevision(reviewedPrompt, rereviewed),
    ).not.toThrow();
  });

  it('rejects changing artifact identity in place', () => {
    const changedIdentity = parsePromptArtifact({
      ...reviewedPrompt,
      id: 'different-fixture',
      version: '2.0.0',
    });
    expect(() =>
      assertPromptArtifactRevision(reviewedPrompt, changedIdentity),
    ).toThrowError(/identity and kind must remain stable/);
  });
});
