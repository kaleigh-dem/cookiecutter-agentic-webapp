import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPromptArtifactReference,
  fingerprintPromptArtifact,
  parsePromptArtifact,
  PromptArtifactError,
} from './prompt-artifact';

function artifactFixture(name: string): Record<string, unknown> {
  const value = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        `packages/backend/agent-eval/artifacts/prompts/${name}.json`,
      ),
      'utf8',
    ),
  ) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Prompt artifact fixture must be an object.');
  }
  return value as Record<string, unknown>;
}

describe('prompt artifacts', () => {
  it('parses reviewed versioned prompt and tool-instruction artifacts', () => {
    const prompt = parsePromptArtifact(
      artifactFixture('synthetic-agent.prompt'),
    );
    const toolInstruction = parsePromptArtifact(
      artifactFixture('synthetic-lookup.tool-instruction'),
    );

    expect(createPromptArtifactReference(prompt)).toEqual({
      id: 'synthetic-agent',
      version: '1.0.0',
      kind: 'prompt',
      fingerprint:
        'ce1000b96cff3851d88b4c3ce46875fe20c39d07d4e96b8d8cf6a495fa5dc207',
    });
    expect(createPromptArtifactReference(toolInstruction)).toEqual({
      id: 'synthetic-lookup',
      version: '1.0.0',
      kind: 'tool_instruction',
      fingerprint:
        'd9ca035d1c37e8c848026c657f9c90507fda56ba5c5a70c24b61e6c78793e5ce',
    });
  });

  it('keeps review metadata out of the content fingerprint', () => {
    const prompt = parsePromptArtifact(
      artifactFixture('synthetic-agent.prompt'),
    );
    const rereviewed = parsePromptArtifact({
      ...prompt,
      review: {
        status: 'approved',
        reviewer: 'second-reviewer',
        reviewedAt: '2026-08-08T01:00:00.000Z',
      },
    });

    expect(fingerprintPromptArtifact(rereviewed)).toBe(
      fingerprintPromptArtifact(prompt),
    );
  });

  it('rejects unapproved artifacts, extra fields, and invalid tool instructions', () => {
    expect(() =>
      parsePromptArtifact({
        ...artifactFixture('synthetic-agent.prompt'),
        review: {
          status: 'pending',
          reviewer: 'repository-review',
          reviewedAt: '2026-08-08T00:00:00.000Z',
        },
      }),
    ).toThrowError(PromptArtifactError);

    expect(() =>
      parsePromptArtifact({
        ...artifactFixture('synthetic-agent.prompt'),
        secret: 'not-reviewed',
      }),
    ).toThrowError(/unsupported fields/);

    const toolInstruction = artifactFixture(
      'synthetic-lookup.tool-instruction',
    );
    delete toolInstruction.toolId;
    expect(() => parsePromptArtifact(toolInstruction)).toThrowError(/toolId/);
  });
});
