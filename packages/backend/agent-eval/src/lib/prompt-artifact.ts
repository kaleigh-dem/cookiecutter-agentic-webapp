import { createHash } from 'node:crypto';

export type PromptArtifactKind = 'prompt' | 'tool_instruction';

export interface PromptArtifactReview {
  readonly status: 'approved';
  readonly reviewer: string;
  readonly reviewedAt: string;
}

interface PromptArtifactBase {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly content: string;
  readonly variables: readonly string[];
  readonly review: PromptArtifactReview;
}

export interface ReviewedPromptArtifact extends PromptArtifactBase {
  readonly kind: 'prompt';
}

export interface ReviewedToolInstructionArtifact extends PromptArtifactBase {
  readonly kind: 'tool_instruction';
  readonly toolId: string;
}

export type PromptArtifact =
  ReviewedPromptArtifact | ReviewedToolInstructionArtifact;

export interface PromptArtifactReference {
  readonly id: string;
  readonly version: string;
  readonly kind: PromptArtifactKind;
  readonly fingerprint: string;
}

export type PromptArtifactErrorCode =
  'invalid_artifact' | 'unapproved_artifact';

export class PromptArtifactError extends Error {
  public readonly code: PromptArtifactErrorCode;

  public constructor(code: PromptArtifactErrorCode, message: string) {
    super(message);
    this.name = 'PromptArtifactError';
    this.code = code;
  }
}

type UnknownRecord = Record<string, unknown>;

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PromptArtifactError(
      'invalid_artifact',
      `${label} must be an object.`,
    );
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new PromptArtifactError(
      'invalid_artifact',
      `${label} contains unsupported fields.`,
    );
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PromptArtifactError(
      'invalid_artifact',
      `${label} must be a non-empty string.`,
    );
  }
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new PromptArtifactError(
      'invalid_artifact',
      `${label} must be an array.`,
    );
  }
  const result = value.map((item, index) =>
    stringValue(item, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    throw new PromptArtifactError(
      'invalid_artifact',
      `${label} must not contain duplicates.`,
    );
  }
  return result;
}

function reviewedAt(value: unknown): string {
  const timestamp = stringValue(value, 'review.reviewedAt');
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'review.reviewedAt must be an ISO-8601 UTC timestamp.',
    );
  }
  return timestamp;
}

function parseReview(value: unknown): PromptArtifactReview {
  const review = record(value, 'review');
  exactKeys(review, ['status', 'reviewer', 'reviewedAt'], 'review');
  if (review.status !== 'approved') {
    throw new PromptArtifactError(
      'unapproved_artifact',
      'Prompt artifacts must be approved before use.',
    );
  }
  return {
    status: 'approved',
    reviewer: stringValue(review.reviewer, 'review.reviewer'),
    reviewedAt: reviewedAt(review.reviewedAt),
  };
}

export function parsePromptArtifact(value: unknown): PromptArtifact {
  const artifact = record(value, 'prompt artifact');
  exactKeys(
    artifact,
    [
      'schemaVersion',
      'id',
      'version',
      'kind',
      'content',
      'variables',
      'toolId',
      'review',
    ],
    'prompt artifact',
  );

  if (artifact.schemaVersion !== 1) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact schemaVersion must be 1.',
    );
  }

  const id = stringValue(artifact.id, 'id');
  if (!ID_PATTERN.test(id)) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact id must use lowercase dot, dash, or alphanumeric segments.',
    );
  }

  const version = stringValue(artifact.version, 'version');
  if (!VERSION_PATTERN.test(version)) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact version must be a stable semantic version.',
    );
  }

  const content = stringValue(artifact.content, 'content');
  const variables = stringArray(artifact.variables, 'variables');
  const review = parseReview(artifact.review);

  if (artifact.kind === 'prompt') {
    if (artifact.toolId !== undefined) {
      throw new PromptArtifactError(
        'invalid_artifact',
        'Prompt artifacts must not declare toolId.',
      );
    }
    return {
      schemaVersion: 1,
      id,
      version,
      kind: 'prompt',
      content,
      variables,
      review,
    };
  }

  if (artifact.kind === 'tool_instruction') {
    return {
      schemaVersion: 1,
      id,
      version,
      kind: 'tool_instruction',
      content,
      variables,
      toolId: stringValue(artifact.toolId, 'toolId'),
      review,
    };
  }

  throw new PromptArtifactError(
    'invalid_artifact',
    'Prompt artifact kind must be prompt or tool_instruction.',
  );
}

export function fingerprintPromptArtifact(artifact: PromptArtifact): string {
  const canonical =
    artifact.kind === 'tool_instruction'
      ? {
          schemaVersion: artifact.schemaVersion,
          id: artifact.id,
          version: artifact.version,
          kind: artifact.kind,
          content: artifact.content,
          variables: artifact.variables,
          toolId: artifact.toolId,
        }
      : {
          schemaVersion: artifact.schemaVersion,
          id: artifact.id,
          version: artifact.version,
          kind: artifact.kind,
          content: artifact.content,
          variables: artifact.variables,
        };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function createPromptArtifactReference(
  artifact: PromptArtifact,
): PromptArtifactReference {
  return {
    id: artifact.id,
    version: artifact.version,
    kind: artifact.kind,
    fingerprint: fingerprintPromptArtifact(artifact),
  };
}

export function parsePromptArtifactReference(
  value: unknown,
): PromptArtifactReference {
  const reference = record(value, 'prompt artifact reference');
  exactKeys(
    reference,
    ['id', 'version', 'kind', 'fingerprint'],
    'prompt artifact reference',
  );
  const id = stringValue(reference.id, 'reference.id');
  const version = stringValue(reference.version, 'reference.version');
  if (!VERSION_PATTERN.test(version)) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact reference version must be a stable semantic version.',
    );
  }
  if (reference.kind !== 'prompt' && reference.kind !== 'tool_instruction') {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact reference kind is invalid.',
    );
  }
  const fingerprint = stringValue(
    reference.fingerprint,
    'reference.fingerprint',
  );
  if (!FINGERPRINT_PATTERN.test(fingerprint)) {
    throw new PromptArtifactError(
      'invalid_artifact',
      'Prompt artifact fingerprint must be a SHA-256 hex digest.',
    );
  }
  return { id, version, kind: reference.kind, fingerprint };
}
