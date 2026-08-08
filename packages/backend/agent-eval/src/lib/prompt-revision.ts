import {
  fingerprintPromptArtifact,
  PromptArtifactError,
  type PromptArtifact,
} from './prompt-artifact';

function compareStableVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => BigInt(part));
  const rightParts = right.split('.').map((part) => BigInt(part));
  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) {
      throw new PromptArtifactError(
        'invalid_artifact',
        'Prompt artifact versions must be stable semantic versions.',
      );
    }
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

export function assertPromptArtifactRevision(
  previous: PromptArtifact,
  current: PromptArtifact,
): void {
  if (previous.id !== current.id || previous.kind !== current.kind) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact identity and kind must remain stable at a reviewed path.',
    );
  }
  if (
    fingerprintPromptArtifact(previous) !==
      fingerprintPromptArtifact(current) &&
    compareStableVersions(current.version, previous.version) <= 0
  ) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Behavior-bearing prompt changes must advance the semantic version.',
    );
  }
}
