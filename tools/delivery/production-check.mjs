import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseEnvironmentFile } from './environment.mjs';
import {
  validateProductionReadiness,
  validateReleaseEnvironmentMatches,
} from './production-readiness.mjs';

function parseArguments(arguments_) {
  const values = arguments_.filter((argument) => argument !== '--');
  return {
    compareReleaseEnvironment: values.includes('--compare-release-environment'),
    filePath:
      values.find((argument) => !argument.startsWith('--')) ??
      'infra/environments/production.env',
  };
}

async function main() {
  const { compareReleaseEnvironment, filePath } = parseArguments(
    process.argv.slice(2),
  );
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  );
  const values = parseEnvironmentFile(await readFile(filePath, 'utf8'));
  const issues = validateProductionReadiness(values, {
    nodeEngine: packageJson.engines?.node,
    nodeVersion: process.version,
  });

  if (compareReleaseEnvironment) {
    issues.push(...validateReleaseEnvironmentMatches(values, process.env));
  }

  const uniqueIssues = [...new Set(issues)];
  if (uniqueIssues.length > 0) {
    for (const issue of uniqueIssues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        backupOwner: values.BACKUP_OWNER,
        environment: values.DEPLOYMENT_ENVIRONMENT,
        file: filePath,
        node: process.version,
        valid: true,
        version: values.APP_VERSION,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
