import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  classifyGovernedEvaluationChange,
  findUncoveredGovernedChanges,
  parseEvaluationEvidence,
  type EvaluationEvidenceV1,
} from '../lib/evidence';
import { assertPassingEvaluationEvidence } from '../lib/evidence-policy';
import {
  createPromptArtifactReference,
  parsePromptArtifact,
} from '../lib/prompt-artifact';
import { assertPromptArtifactRevision } from '../lib/prompt-revision';

const root = process.cwd();
const evidenceDirectory = resolve(root, 'docs/evaluations/evidence');
const evidencePaths = readdirSync(evidenceDirectory)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => `docs/evaluations/evidence/${name}`);

if (evidencePaths.length === 0) {
  throw new Error('At least one evaluation evidence manifest is required.');
}

const evidenceByPath = new Map<string, EvaluationEvidenceV1>();
for (const path of evidencePaths) {
  const raw = JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown;
  evidenceByPath.set(path, parseEvaluationEvidence(raw));
}

function promptAtRevision(revision: string, path: string): unknown | undefined {
  try {
    return JSON.parse(
      execFileSync('git', ['show', `${revision}:${path}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ) as unknown;
  } catch {
    return undefined;
  }
}

const base = process.env.NX_BASE;
const head = process.env.NX_HEAD;
if ((base === undefined) !== (head === undefined)) {
  throw new Error('NX_BASE and NX_HEAD must be provided together.');
}

if (base !== undefined && head !== undefined) {
  const shaPattern = /^[a-f0-9]{40}$/;
  if (!shaPattern.test(base) || !shaPattern.test(head)) {
    throw new Error('NX_BASE and NX_HEAD must be full Git commit SHAs.');
  }
  const changedPaths = execFileSync(
    'git',
    ['diff', '--no-renames', '--name-only', '--diff-filter=ACMRTD', base, head],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .map((path) => path.trim())
    .filter(Boolean);
  const changedEvidence = evidencePaths
    .filter((path) => changedPaths.includes(path))
    .map((path) => evidenceByPath.get(path))
    .filter((item): item is EvaluationEvidenceV1 => item !== undefined);

  for (const evidence of changedEvidence) {
    assertPassingEvaluationEvidence(evidence);
  }

  const uncovered = findUncoveredGovernedChanges(changedPaths, changedEvidence);
  if (uncovered.length > 0) {
    const lines = uncovered.map((change) => `- ${change.kind}: ${change.path}`);
    throw new Error(
      `Governed AI changes require changed evaluation evidence:\n${lines.join('\n')}`,
    );
  }

  for (const path of changedPaths) {
    if (classifyGovernedEvaluationChange(path) !== 'prompt') continue;
    const currentPath = resolve(root, path);
    if (!existsSync(currentPath)) continue;

    const current = parsePromptArtifact(
      JSON.parse(readFileSync(currentPath, 'utf8')) as unknown,
    );
    const previousValue = promptAtRevision(base, path);
    if (previousValue !== undefined) {
      assertPromptArtifactRevision(parsePromptArtifact(previousValue), current);
    }

    const reference = createPromptArtifactReference(current);
    const bound = changedEvidence.some((evidence) =>
      evidence.promptArtifacts.some(
        (candidate) =>
          candidate.id === reference.id &&
          candidate.version === reference.version &&
          candidate.kind === reference.kind &&
          candidate.fingerprint === reference.fingerprint,
      ),
    );
    if (!bound) {
      throw new Error(
        `Changed prompt artifact is not fingerprint-bound by changed evaluation evidence: ${path}`,
      );
    }
  }
}

console.log(
  `Validated ${evidencePaths.length} evaluation evidence manifest(s).`,
);
