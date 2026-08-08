import {
  evaluateEvaluationBudget,
  parseEvaluationBudget,
  parseEvaluationUsage,
  type EvaluationBudget,
  type EvaluationUsage,
} from './evaluation';
import {
  parsePromptArtifactReference,
  type PromptArtifactReference,
} from './prompt-artifact';

export type GovernedEvaluationChangeKind = 'prompt' | 'model' | 'tool';

export interface EvaluationEvidenceChange {
  readonly kind: GovernedEvaluationChangeKind;
  readonly path: string;
}

export interface EvaluationEvidenceResult {
  readonly fixtureId: string;
  readonly passed: boolean;
  readonly qualityScore: number;
  readonly latencyMs: number;
  readonly budgetPassed: boolean;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly usage?: EvaluationUsage;
  readonly estimatedCostUsd?: number;
}

export interface EvaluationEvidenceV1 {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly taskId: string;
  readonly recordedAt: string;
  readonly promptArtifacts: readonly PromptArtifactReference[];
  readonly coveredChanges: readonly EvaluationEvidenceChange[];
  readonly checks: readonly string[];
  readonly budget: EvaluationBudget;
  readonly results: readonly EvaluationEvidenceResult[];
}

export class EvaluationEvidenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'EvaluationEvidenceError';
  }
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EvaluationEvidenceError(`${label} must be an object.`);
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  label: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new EvaluationEvidenceError(`${label} contains unsupported fields.`);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EvaluationEvidenceError(`${label} must be a non-empty string.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new EvaluationEvidenceError(`${label} must be boolean.`);
  }
  return value;
}

function finiteNonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new EvaluationEvidenceError(
      `${label} must be a finite non-negative number.`,
    );
  }
  return value;
}

function scoreValue(value: unknown, label: string): number {
  const score = finiteNonNegative(value, label);
  if (score > 1) {
    throw new EvaluationEvidenceError(`${label} must not exceed 1.`);
  }
  return score;
}

function isoTimestamp(value: unknown, label: string): string {
  const timestamp = stringValue(value, label);
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    throw new EvaluationEvidenceError(
      `${label} must be an ISO-8601 UTC timestamp.`,
    );
  }
  return timestamp;
}

function parseChange(value: unknown): EvaluationEvidenceChange {
  const change = record(value, 'covered change');
  exactKeys(change, ['kind', 'path'], 'covered change');
  if (
    change.kind !== 'prompt' &&
    change.kind !== 'model' &&
    change.kind !== 'tool'
  ) {
    throw new EvaluationEvidenceError('covered change kind is invalid.');
  }
  const path = stringValue(change.path, 'covered change path');
  if (path.startsWith('/') || path.includes('..')) {
    throw new EvaluationEvidenceError(
      'covered change path must be repository-relative.',
    );
  }
  return { kind: change.kind, path };
}

function parseResult(
  value: unknown,
  budget: EvaluationBudget,
): EvaluationEvidenceResult {
  const result = record(value, 'evaluation evidence result');
  exactKeys(
    result,
    [
      'fixtureId',
      'passed',
      'qualityScore',
      'latencyMs',
      'budgetPassed',
      'providerId',
      'modelId',
      'usage',
      'estimatedCostUsd',
    ],
    'evaluation evidence result',
  );

  const qualityScore = scoreValue(result.qualityScore, 'result.qualityScore');
  const latencyMs = finiteNonNegative(result.latencyMs, 'result.latencyMs');
  const usage =
    result.usage === undefined ? undefined : parseEvaluationUsage(result.usage);
  const estimatedCostUsd =
    result.estimatedCostUsd === undefined
      ? undefined
      : finiteNonNegative(result.estimatedCostUsd, 'result.estimatedCostUsd');
  const budgetResult = evaluateEvaluationBudget(
    {
      qualityScore,
      latencyMs,
      ...(usage === undefined ? {} : { usage }),
      ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
    },
    budget,
  );
  const budgetPassed = booleanValue(result.budgetPassed, 'result.budgetPassed');
  if (budgetPassed !== budgetResult.passed) {
    throw new EvaluationEvidenceError(
      'result.budgetPassed does not match the declared budget.',
    );
  }
  const passed = booleanValue(result.passed, 'result.passed');
  if (passed && !budgetPassed) {
    throw new EvaluationEvidenceError(
      'A passing evaluation result cannot fail its budget.',
    );
  }

  return {
    fixtureId: stringValue(result.fixtureId, 'result.fixtureId'),
    passed,
    qualityScore,
    latencyMs,
    budgetPassed,
    ...(result.providerId === undefined
      ? {}
      : { providerId: stringValue(result.providerId, 'result.providerId') }),
    ...(result.modelId === undefined
      ? {}
      : { modelId: stringValue(result.modelId, 'result.modelId') }),
    ...(usage === undefined ? {} : { usage }),
    ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
  };
}

export function parseEvaluationEvidence(value: unknown): EvaluationEvidenceV1 {
  const evidence = record(value, 'evaluation evidence');
  exactKeys(
    evidence,
    [
      'schemaVersion',
      'evidenceId',
      'taskId',
      'recordedAt',
      'promptArtifacts',
      'coveredChanges',
      'checks',
      'budget',
      'results',
    ],
    'evaluation evidence',
  );
  if (evidence.schemaVersion !== 1) {
    throw new EvaluationEvidenceError(
      'evaluation evidence schemaVersion must be 1.',
    );
  }
  if (!Array.isArray(evidence.promptArtifacts)) {
    throw new EvaluationEvidenceError('promptArtifacts must be an array.');
  }
  if (
    !Array.isArray(evidence.coveredChanges) ||
    evidence.coveredChanges.length === 0
  ) {
    throw new EvaluationEvidenceError(
      'coveredChanges must contain at least one governed change.',
    );
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
    throw new EvaluationEvidenceError(
      'checks must contain at least one command.',
    );
  }
  if (!Array.isArray(evidence.results) || evidence.results.length === 0) {
    throw new EvaluationEvidenceError(
      'results must contain at least one evaluation result.',
    );
  }

  const promptArtifacts = evidence.promptArtifacts.map((item) =>
    parsePromptArtifactReference(item),
  );
  const coveredChanges = evidence.coveredChanges.map(parseChange);
  const checks = evidence.checks.map((check, index) =>
    stringValue(check, `checks[${index}]`),
  );
  if (new Set(checks).size !== checks.length) {
    throw new EvaluationEvidenceError('checks must not contain duplicates.');
  }
  const budget = parseEvaluationBudget(evidence.budget);
  const results = evidence.results.map((item) => parseResult(item, budget));

  return {
    schemaVersion: 1,
    evidenceId: stringValue(evidence.evidenceId, 'evidenceId'),
    taskId: stringValue(evidence.taskId, 'taskId'),
    recordedAt: isoTimestamp(evidence.recordedAt, 'recordedAt'),
    promptArtifacts,
    coveredChanges,
    checks,
    budget,
    results,
  };
}

function isTestSource(path: string): boolean {
  return /\.(spec|test)\.ts$/.test(path);
}

export function classifyGovernedEvaluationChange(
  path: string,
): GovernedEvaluationChangeKind | undefined {
  if (
    path.startsWith('packages/backend/agent-eval/artifacts/prompts/') &&
    path.endsWith('.json')
  ) {
    return 'prompt';
  }
  if (path.startsWith('packages/backend/model/src/') && !isTestSource(path)) {
    return 'model';
  }
  if (
    path.startsWith('packages/backend/agent-tool/src/') &&
    !isTestSource(path)
  ) {
    return 'tool';
  }
  return undefined;
}

export function findUncoveredGovernedChanges(
  changedPaths: readonly string[],
  evidence: readonly EvaluationEvidenceV1[],
): readonly EvaluationEvidenceChange[] {
  const covered = new Set(
    evidence.flatMap((item) =>
      item.coveredChanges.map((change) => `${change.kind}:${change.path}`),
    ),
  );
  const uncovered: EvaluationEvidenceChange[] = [];
  for (const path of changedPaths) {
    const kind = classifyGovernedEvaluationChange(path);
    if (kind !== undefined && !covered.has(`${kind}:${path}`)) {
      uncovered.push({ kind, path });
    }
  }
  return uncovered;
}
