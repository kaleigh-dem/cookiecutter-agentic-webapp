export type EvaluationDataClassification =
  'synthetic' | 'redacted' | 'production-derived';

export interface ProductionDataReview {
  readonly approvedBy: string;
  readonly reviewedAt: string;
}

export interface EvaluationFixture<TInput, TExpected> {
  readonly id: string;
  readonly classification: EvaluationDataClassification;
  readonly input: TInput;
  readonly expected: TExpected;
  readonly productionDataReview?: ProductionDataReview;
}

export interface EvaluationUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens?: number;
}

export interface EvaluationPricing {
  readonly inputUsdPerMillionTokens: number;
  readonly outputUsdPerMillionTokens: number;
  readonly cachedInputUsdPerMillionTokens?: number;
}

export interface EvaluationBudget {
  readonly minQualityScore?: number;
  readonly maxLatencyMs?: number;
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
  readonly maxTotalTokens?: number;
  readonly maxEstimatedCostUsd?: number;
}

export type EvaluationBudgetViolation =
  | 'quality_below_minimum'
  | 'latency_exceeded'
  | 'usage_missing'
  | 'input_tokens_exceeded'
  | 'output_tokens_exceeded'
  | 'total_tokens_exceeded'
  | 'estimated_cost_missing'
  | 'estimated_cost_exceeded';

export interface EvaluationBudgetResult {
  readonly passed: boolean;
  readonly violations: readonly EvaluationBudgetViolation[];
}

export interface EvaluationMetric {
  readonly score: number;
  readonly passed: boolean;
  readonly code: string;
}

export interface EvaluationContext<TInput, TOutput, TExpected> {
  readonly fixtureId: string;
  readonly input: TInput;
  readonly output: TOutput;
  readonly expected: TExpected;
}

export interface EvaluationEvaluator<TInput, TOutput, TExpected> {
  readonly id: string;
  readonly kind: 'rule' | 'model_grader';
  evaluate(
    context: EvaluationContext<TInput, TOutput, TExpected>,
  ): EvaluationMetric | Promise<EvaluationMetric>;
}

export interface EvaluationSubjectResult<TOutput> {
  readonly output: TOutput;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly usage?: EvaluationUsage;
}

export interface EvaluationMetricResult extends EvaluationMetric {
  readonly evaluatorId: string;
  readonly evaluatorKind: 'rule' | 'model_grader';
}

export interface EvaluationCaseResult {
  readonly fixtureId: string;
  readonly classification: EvaluationDataClassification;
  readonly passed: boolean;
  readonly qualityScore: number;
  readonly latencyMs: number;
  readonly metrics: readonly EvaluationMetricResult[];
  readonly budget: EvaluationBudgetResult;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly usage?: EvaluationUsage;
  readonly estimatedCostUsd?: number;
}

export interface EvaluationCaseOptions<TInput, TOutput, TExpected> {
  readonly fixture: EvaluationFixture<TInput, TExpected>;
  readonly subject: (
    input: TInput,
  ) =>
    | EvaluationSubjectResult<TOutput>
    | Promise<EvaluationSubjectResult<TOutput>>;
  readonly evaluators: readonly EvaluationEvaluator<
    TInput,
    TOutput,
    TExpected
  >[];
  readonly budget: EvaluationBudget;
  readonly pricing?: EvaluationPricing;
  readonly clock?: () => number;
}

export type EvaluationErrorCode =
  | 'invalid_fixture'
  | 'invalid_metric'
  | 'invalid_usage'
  | 'invalid_pricing'
  | 'invalid_budget'
  | 'invalid_measurement';

export class EvaluationError extends Error {
  public readonly code: EvaluationErrorCode;

  public constructor(code: EvaluationErrorCode, message: string) {
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
  }
}

type UnknownRecord = Record<string, unknown>;

function nonEmptyString(
  value: unknown,
  label: string,
  code: EvaluationErrorCode,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new EvaluationError(code, `${label} must be non-empty.`);
  }
  return value;
}

function finiteNonNegative(
  value: unknown,
  label: string,
  code: EvaluationErrorCode,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new EvaluationError(
      code,
      `${label} must be a finite non-negative number.`,
    );
  }
  return value;
}

function safeNonNegativeInteger(
  value: unknown,
  label: string,
  code: EvaluationErrorCode,
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new EvaluationError(code, `${label} must be a non-negative integer.`);
  }
  return value;
}

function parseIsoTimestamp(value: unknown, label: string): string {
  const timestamp = nonEmptyString(value, label, 'invalid_fixture');
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    throw new EvaluationError(
      'invalid_fixture',
      `${label} must be an ISO-8601 UTC timestamp.`,
    );
  }
  return timestamp;
}

function validateFixture<TInput, TExpected>(
  fixture: EvaluationFixture<TInput, TExpected>,
): void {
  nonEmptyString(fixture.id, 'fixture.id', 'invalid_fixture');
  if (
    fixture.classification !== 'synthetic' &&
    fixture.classification !== 'redacted' &&
    fixture.classification !== 'production-derived'
  ) {
    throw new EvaluationError(
      'invalid_fixture',
      'fixture.classification is invalid.',
    );
  }
  if (fixture.classification === 'production-derived') {
    if (fixture.productionDataReview === undefined) {
      throw new EvaluationError(
        'invalid_fixture',
        'Production-derived fixtures require explicit data review evidence.',
      );
    }
    nonEmptyString(
      fixture.productionDataReview.approvedBy,
      'fixture.productionDataReview.approvedBy',
      'invalid_fixture',
    );
    parseIsoTimestamp(
      fixture.productionDataReview.reviewedAt,
      'fixture.productionDataReview.reviewedAt',
    );
  }
}

export function parseEvaluationUsage(value: unknown): EvaluationUsage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EvaluationError('invalid_usage', 'usage must be an object.');
  }
  const usage = value as UnknownRecord;
  const allowed = [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cachedInputTokens',
  ];
  if (Object.keys(usage).some((key) => !allowed.includes(key))) {
    throw new EvaluationError(
      'invalid_usage',
      'usage contains unsupported fields.',
    );
  }

  const inputTokens = safeNonNegativeInteger(
    usage.inputTokens,
    'usage.inputTokens',
    'invalid_usage',
  );
  const outputTokens = safeNonNegativeInteger(
    usage.outputTokens,
    'usage.outputTokens',
    'invalid_usage',
  );
  const totalTokens = safeNonNegativeInteger(
    usage.totalTokens,
    'usage.totalTokens',
    'invalid_usage',
  );
  if (totalTokens !== inputTokens + outputTokens) {
    throw new EvaluationError(
      'invalid_usage',
      'usage.totalTokens must equal inputTokens plus outputTokens.',
    );
  }

  if (usage.cachedInputTokens === undefined) {
    return { inputTokens, outputTokens, totalTokens };
  }
  const cachedInputTokens = safeNonNegativeInteger(
    usage.cachedInputTokens,
    'usage.cachedInputTokens',
    'invalid_usage',
  );
  if (cachedInputTokens > inputTokens) {
    throw new EvaluationError(
      'invalid_usage',
      'usage.cachedInputTokens must not exceed inputTokens.',
    );
  }
  return { inputTokens, outputTokens, totalTokens, cachedInputTokens };
}

export function parseEvaluationBudget(value: unknown): EvaluationBudget {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new EvaluationError('invalid_budget', 'budget must be an object.');
  }
  const budget = value as UnknownRecord;
  const allowed = [
    'minQualityScore',
    'maxLatencyMs',
    'maxInputTokens',
    'maxOutputTokens',
    'maxTotalTokens',
    'maxEstimatedCostUsd',
  ];
  if (Object.keys(budget).some((key) => !allowed.includes(key))) {
    throw new EvaluationError(
      'invalid_budget',
      'budget contains unsupported fields.',
    );
  }

  const result: {
    minQualityScore?: number;
    maxLatencyMs?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxTotalTokens?: number;
    maxEstimatedCostUsd?: number;
  } = {};

  if (budget.minQualityScore !== undefined) {
    const score = finiteNonNegative(
      budget.minQualityScore,
      'budget.minQualityScore',
      'invalid_budget',
    );
    if (score > 1) {
      throw new EvaluationError(
        'invalid_budget',
        'budget.minQualityScore must not exceed 1.',
      );
    }
    result.minQualityScore = score;
  }
  if (budget.maxLatencyMs !== undefined) {
    result.maxLatencyMs = finiteNonNegative(
      budget.maxLatencyMs,
      'budget.maxLatencyMs',
      'invalid_budget',
    );
  }
  if (budget.maxInputTokens !== undefined) {
    result.maxInputTokens = safeNonNegativeInteger(
      budget.maxInputTokens,
      'budget.maxInputTokens',
      'invalid_budget',
    );
  }
  if (budget.maxOutputTokens !== undefined) {
    result.maxOutputTokens = safeNonNegativeInteger(
      budget.maxOutputTokens,
      'budget.maxOutputTokens',
      'invalid_budget',
    );
  }
  if (budget.maxTotalTokens !== undefined) {
    result.maxTotalTokens = safeNonNegativeInteger(
      budget.maxTotalTokens,
      'budget.maxTotalTokens',
      'invalid_budget',
    );
  }
  if (budget.maxEstimatedCostUsd !== undefined) {
    result.maxEstimatedCostUsd = finiteNonNegative(
      budget.maxEstimatedCostUsd,
      'budget.maxEstimatedCostUsd',
      'invalid_budget',
    );
  }
  return result;
}

function validatePricing(pricing: EvaluationPricing): EvaluationPricing {
  const inputUsdPerMillionTokens = finiteNonNegative(
    pricing.inputUsdPerMillionTokens,
    'pricing.inputUsdPerMillionTokens',
    'invalid_pricing',
  );
  const outputUsdPerMillionTokens = finiteNonNegative(
    pricing.outputUsdPerMillionTokens,
    'pricing.outputUsdPerMillionTokens',
    'invalid_pricing',
  );
  if (pricing.cachedInputUsdPerMillionTokens === undefined) {
    return { inputUsdPerMillionTokens, outputUsdPerMillionTokens };
  }
  return {
    inputUsdPerMillionTokens,
    outputUsdPerMillionTokens,
    cachedInputUsdPerMillionTokens: finiteNonNegative(
      pricing.cachedInputUsdPerMillionTokens,
      'pricing.cachedInputUsdPerMillionTokens',
      'invalid_pricing',
    ),
  };
}

export function estimateEvaluationCostUsd(
  usageValue: EvaluationUsage,
  pricingValue: EvaluationPricing,
): number {
  const usage = parseEvaluationUsage(usageValue);
  const pricing = validatePricing(pricingValue);
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const regularInputTokens = usage.inputTokens - cachedInputTokens;
  const cachedRate =
    pricing.cachedInputUsdPerMillionTokens ?? pricing.inputUsdPerMillionTokens;
  return (
    (regularInputTokens * pricing.inputUsdPerMillionTokens +
      cachedInputTokens * cachedRate +
      usage.outputTokens * pricing.outputUsdPerMillionTokens) /
    1_000_000
  );
}

export function evaluateEvaluationBudget(
  observation: {
    readonly qualityScore: number;
    readonly latencyMs: number;
    readonly usage?: EvaluationUsage;
    readonly estimatedCostUsd?: number;
  },
  budgetValue: EvaluationBudget,
): EvaluationBudgetResult {
  const budget = parseEvaluationBudget(budgetValue);
  const qualityScore = finiteNonNegative(
    observation.qualityScore,
    'qualityScore',
    'invalid_measurement',
  );
  if (qualityScore > 1) {
    throw new EvaluationError(
      'invalid_measurement',
      'qualityScore must not exceed 1.',
    );
  }
  const latencyMs = finiteNonNegative(
    observation.latencyMs,
    'latencyMs',
    'invalid_measurement',
  );
  const violations: EvaluationBudgetViolation[] = [];

  if (
    budget.minQualityScore !== undefined &&
    qualityScore < budget.minQualityScore
  ) {
    violations.push('quality_below_minimum');
  }
  if (budget.maxLatencyMs !== undefined && latencyMs > budget.maxLatencyMs) {
    violations.push('latency_exceeded');
  }

  const tokenBudgetConfigured =
    budget.maxInputTokens !== undefined ||
    budget.maxOutputTokens !== undefined ||
    budget.maxTotalTokens !== undefined;
  let usage: EvaluationUsage | undefined;
  if (observation.usage !== undefined) {
    usage = parseEvaluationUsage(observation.usage);
  } else if (tokenBudgetConfigured) {
    violations.push('usage_missing');
  }

  if (
    usage !== undefined &&
    budget.maxInputTokens !== undefined &&
    usage.inputTokens > budget.maxInputTokens
  ) {
    violations.push('input_tokens_exceeded');
  }
  if (
    usage !== undefined &&
    budget.maxOutputTokens !== undefined &&
    usage.outputTokens > budget.maxOutputTokens
  ) {
    violations.push('output_tokens_exceeded');
  }
  if (
    usage !== undefined &&
    budget.maxTotalTokens !== undefined &&
    usage.totalTokens > budget.maxTotalTokens
  ) {
    violations.push('total_tokens_exceeded');
  }

  if (budget.maxEstimatedCostUsd !== undefined) {
    if (observation.estimatedCostUsd === undefined) {
      violations.push('estimated_cost_missing');
    } else {
      const cost = finiteNonNegative(
        observation.estimatedCostUsd,
        'estimatedCostUsd',
        'invalid_measurement',
      );
      if (cost > budget.maxEstimatedCostUsd) {
        violations.push('estimated_cost_exceeded');
      }
    }
  }

  return { passed: violations.length === 0, violations };
}

function validateMetric(metric: EvaluationMetric): EvaluationMetric {
  if (typeof metric !== 'object' || metric === null) {
    throw new EvaluationError(
      'invalid_metric',
      'Evaluator result must be an object.',
    );
  }
  const score = finiteNonNegative(
    metric.score,
    'metric.score',
    'invalid_metric',
  );
  if (score > 1 || typeof metric.passed !== 'boolean') {
    throw new EvaluationError(
      'invalid_metric',
      'Evaluator results require a score from 0 to 1 and a boolean pass state.',
    );
  }
  const code = nonEmptyString(metric.code, 'metric.code', 'invalid_metric');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) {
    throw new EvaluationError(
      'invalid_metric',
      'metric.code must be a lowercase snake-case identifier up to 64 characters.',
    );
  }
  return { score, passed: metric.passed, code };
}

export async function runEvaluationCase<TInput, TOutput, TExpected>(
  options: EvaluationCaseOptions<TInput, TOutput, TExpected>,
): Promise<EvaluationCaseResult> {
  validateFixture(options.fixture);
  if (options.evaluators.length === 0) {
    throw new EvaluationError(
      'invalid_metric',
      'At least one evaluator is required.',
    );
  }

  const evaluatorIds = options.evaluators.map((evaluator) =>
    nonEmptyString(evaluator.id, 'evaluator.id', 'invalid_metric'),
  );
  if (new Set(evaluatorIds).size !== evaluatorIds.length) {
    throw new EvaluationError(
      'invalid_metric',
      'Evaluator ids must be unique within a case.',
    );
  }

  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const subject = await options.subject(options.fixture.input);
  const finishedAt = clock();
  const latencyMs = finishedAt - startedAt;
  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    throw new EvaluationError(
      'invalid_measurement',
      'Evaluation clock must produce monotonic finite values.',
    );
  }

  const context: EvaluationContext<TInput, TOutput, TExpected> = {
    fixtureId: options.fixture.id,
    input: options.fixture.input,
    output: subject.output,
    expected: options.fixture.expected,
  };
  const metrics: EvaluationMetricResult[] = [];
  for (const evaluator of options.evaluators) {
    if (evaluator.kind !== 'rule' && evaluator.kind !== 'model_grader') {
      throw new EvaluationError(
        'invalid_metric',
        'Evaluator kind must be rule or model_grader.',
      );
    }
    const metric = validateMetric(await evaluator.evaluate(context));
    metrics.push({
      evaluatorId: evaluator.id,
      evaluatorKind: evaluator.kind,
      ...metric,
    });
  }

  const qualityScore =
    metrics.reduce((total, metric) => total + metric.score, 0) / metrics.length;
  const usage =
    subject.usage === undefined
      ? undefined
      : parseEvaluationUsage(subject.usage);
  const estimatedCostUsd =
    usage !== undefined && options.pricing !== undefined
      ? estimateEvaluationCostUsd(usage, options.pricing)
      : undefined;
  const budget = evaluateEvaluationBudget(
    {
      qualityScore,
      latencyMs,
      ...(usage === undefined ? {} : { usage }),
      ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
    },
    options.budget,
  );
  const passed = metrics.every((metric) => metric.passed) && budget.passed;

  return {
    fixtureId: options.fixture.id,
    classification: options.fixture.classification,
    passed,
    qualityScore,
    latencyMs,
    metrics,
    budget,
    ...(subject.providerId === undefined
      ? {}
      : {
          providerId: nonEmptyString(
            subject.providerId,
            'providerId',
            'invalid_measurement',
          ),
        }),
    ...(subject.modelId === undefined
      ? {}
      : {
          modelId: nonEmptyString(
            subject.modelId,
            'modelId',
            'invalid_measurement',
          ),
        }),
    ...(usage === undefined ? {} : { usage }),
    ...(estimatedCostUsd === undefined ? {} : { estimatedCostUsd }),
  };
}
