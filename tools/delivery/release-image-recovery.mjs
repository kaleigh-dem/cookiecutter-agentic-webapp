import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const missingManifestPattern =
  /^(?:error response from daemon:\s*)?(?:manifest unknown|no such manifest)(?::|\s|$)/iu;

function requireValue(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /[\r\n]/u.test(normalized)) {
    throw new Error(`${label} is required and must be one line.`);
  }
  return normalized;
}

function parseArguments(arguments_) {
  const [command = '', ...rest] = arguments_;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument?.startsWith('--')) continue;
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  return { command, values };
}

export function releaseBuildInputsFingerprint(input) {
  const canonical = {
    apiBaseUrl: requireValue(input.apiBaseUrl, 'API base URL'),
    authenticationProfile: requireValue(
      input.authenticationProfile,
      'Authentication profile',
    ),
    authSessionEndpoint: requireValue(
      input.authSessionEndpoint,
      'Authentication session endpoint',
    ),
    authSessionRefreshSkewSeconds: requireValue(
      input.authSessionRefreshSkewSeconds,
      'Authentication refresh skew seconds',
    ),
  };
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')}`;
}

export function manifestInspectionProvesAbsence(stderr) {
  const lines = String(stderr ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.length > 0 && lines.every((line) => missingManifestPattern.test(line))
  );
}

export function verifyRecoveryLabels(labels, expected) {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
    throw new Error('Published image labels are missing.');
  }
  const requirements = {
    'org.opencontainers.image.version': requireValue(
      expected.version,
      'Expected version',
    ),
    'org.opencontainers.image.revision': requireValue(
      expected.revision,
      'Expected revision',
    ),
    'io.steadystack.release.run-id': requireValue(
      expected.runId,
      'Expected workflow run ID',
    ),
    'io.steadystack.release.build-inputs-sha256': requireValue(
      expected.buildInputsSha256,
      'Expected build-input fingerprint',
    ),
  };

  const mismatches = Object.entries(requirements).filter(
    ([key, value]) => labels[key] !== value,
  );
  if (mismatches.length > 0) {
    throw new Error(
      `Published image is not recoverable by this workflow run: ${mismatches
        .map(
          ([key, value]) => `${key}=${String(labels[key])} (expected ${value})`,
        )
        .join('; ')}.`,
    );
  }
  return requirements;
}

async function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  if (command === 'fingerprint') {
    process.stdout.write(
      `${releaseBuildInputsFingerprint({
        apiBaseUrl: values['api-base-url'],
        authenticationProfile: values['authentication-profile'],
        authSessionEndpoint: values['auth-session-endpoint'],
        authSessionRefreshSkewSeconds:
          values['auth-session-refresh-skew-seconds'],
      })}\n`,
    );
    return;
  }
  if (command === 'assert-manifest-absent') {
    const errorFile = requireValue(values['error-file'], 'Error file');
    const stderr = await readFile(errorFile, 'utf8');
    if (!manifestInspectionProvesAbsence(stderr)) {
      throw new Error(
        `Registry inspection did not prove that ${
          values.image ?? 'the image'
        } is absent. Failing closed.\n${stderr.trim()}`,
      );
    }
    process.stdout.write('absent\n');
    return;
  }
  if (command === 'verify-labels') {
    const labels = JSON.parse(
      await readFile(
        requireValue(values['labels-file'], 'Labels file'),
        'utf8',
      ),
    );
    verifyRecoveryLabels(labels, {
      version: values.version,
      revision: values.revision,
      runId: values['run-id'],
      buildInputsSha256: values['build-inputs-sha256'],
    });
    process.stdout.write('verified\n');
    return;
  }
  throw new Error(`Unknown release recovery command: ${command}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
