import { EvaluationEvidenceError, type EvaluationEvidenceV1 } from './evidence';

export function assertPassingEvaluationEvidence(
  evidence: EvaluationEvidenceV1,
): void {
  if (
    evidence.results.some((result) => !result.passed || !result.budgetPassed)
  ) {
    throw new EvaluationEvidenceError(
      `Evaluation evidence must contain only passing results: ${evidence.evidenceId}`,
    );
  }
}
