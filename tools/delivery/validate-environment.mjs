import { readAndValidateEnvironmentFile } from './environment.mjs';

async function main() {
  const arguments_ = process.argv.slice(2);
  const filePath = arguments_.find((argument) => !argument.startsWith('--'));
  const allowLocal = arguments_.includes('--allow-local');
  const allowPlaceholders = arguments_.includes('--allow-placeholders');

  if (!filePath) {
    throw new Error(
      'Usage: node tools/delivery/validate-environment.mjs <environment-file> [--allow-local] [--allow-placeholders]',
    );
  }

  const { issues, values } = await readAndValidateEnvironmentFile(filePath, {
    allowLocal,
    allowPlaceholders,
  });

  if (issues.length > 0) {
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        environment: values.DEPLOYMENT_ENVIRONMENT,
        file: filePath,
        valid: true,
        version: values.APP_VERSION,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
