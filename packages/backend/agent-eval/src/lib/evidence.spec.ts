import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPromptArtifactReference,
  parsePromptArtifact,
} from './prompt-artifact';
import {
  classifyGovernedEvaluationChange,
  findUncoveredGovernedChanges,
  parseEvaluationEvidence,
} from './evidence';

function jsonFixture(path: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as unknown;
}

describe('evaluation evidence', () => {
  it('validates the committed P14-04 evidence and binds reviewed prompt fingerprints', () => {
    const evidence = parseEvaluationEvidence(
      jsonFixture('docs/evaluations/evidence/p14-04.json'),
    );
    const prompt = parsePromptArtifact(
      jsonFixture(
        'packages/backend/agent-eval/artifacts/prompts/synthetic-agent.prompt.json',
      ),
    );
    const toolInstruction = parsePromptArtifact(
      jsonFixture(
        'packages/backend/agent-eval/artifacts/prompts/synthetic-lookup.tool-instruction.json',
      ),
    );

    expect(evidence.promptArtifacts).toEqual([
      createPromptArtifactReference(prompt),
      createPromptArtifactReference(toolInstruction),
    ]);
    expect(evidence.results[0]).toMatchObject({
      passed: true,
      qualityScore: 1,
      latencyMs: 5,
      budgetPassed: true,
      estimatedCostUsd: 0.000015,
    });
  });

  it('classifies governed prompt, model, and tool runtime changes but excludes tests', () => {
    expect(
      classifyGovernedEvaluationChange(
        'packages/backend/agent-eval/artifacts/prompts/support.prompt.json',
      ),
    ).toBe('prompt');
    expect(
      classifyGovernedEvaluationChange(
        'packages/backend/model/src/lib/model.ts',
      ),
    ).toBe('model');
    expect(
      classifyGovernedEvaluationChange(
        'packages/backend/agent-tool/src/lib/tool-runtime.ts',
      ),
    ).toBe('tool');
    expect(
      classifyGovernedEvaluationChange(
        'packages/backend/agent-tool/src/lib/tool-runtime.spec.ts',
      ),
    ).toBeUndefined();
  });

  it('requires changed evidence to enumerate every governed source change', () => {
    const evidence = parseEvaluationEvidence(
      jsonFixture('docs/evaluations/evidence/p14-04.json'),
    );
    expect(
      findUncoveredGovernedChanges(
        [
          'packages/backend/agent-eval/artifacts/prompts/synthetic-agent.prompt.json',
          'packages/backend/model/src/lib/model.ts',
        ],
        [evidence],
      ),
    ).toEqual([
      { kind: 'model', path: 'packages/backend/model/src/lib/model.ts' },
    ]);
  });
});
