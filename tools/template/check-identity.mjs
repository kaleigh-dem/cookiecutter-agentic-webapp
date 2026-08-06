import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ignoredSegments = new Set([
  '.git',
  '.next',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'test-output',
]);

const templatePackageScope = '@steadystack';
const templateTechnicalIdentity = 'steadystack';
const templateDisplayIdentity = 'SteadyStack';
const templateUpperIdentity = 'STEADYSTACK';
const upstreamRepository = 'kaleigh-dem/steady-stack';
const upstreamUrl = `https://github.com/${upstreamRepository}`;
const personalCodeowner = `@${['kaleigh', 'dem'].join('-')}`;
const formerOidcAudience = ['agentic', 'api'].join('-');
const formerSessionCookie = ['agentic', 'access', 'token'].join('_');
const formerHeroLabel = ['NX', 'AGENTIC', 'TEMPLATE'].join(' ');

const forbiddenPatterns = [
  ['template package scope', templatePackageScope],
  ['template technical identity', templateTechnicalIdentity],
  ['template display or class identity', templateDisplayIdentity],
  ['template upper-snake identity', templateUpperIdentity],
  ['former OIDC audience', formerOidcAudience],
  ['former session cookie', formerSessionCookie],
  ['former hero label', formerHeroLabel],
  ['personal CODEOWNER', personalCodeowner],
];

const allowedTemplateSourcePaths = new Set([
  'tools/workspace-plugin/src/generators/init/generator.ts',
  'tools/workspace-plugin/src/generators/init/generator.spec.ts',
  'tools/workspace-plugin/src/generators/init-output.integration.ts',
  'tools/workspace-plugin/src/generators/preset/generator.spec.ts',
  'tools/template/check-identity.mjs',
]);
const allowedUpstreamPaths = new Set([
  'README.md',
  'workspace.template.json',
  'docs/template-initialization.md',
  ...allowedTemplateSourcePaths,
]);

function isIgnored(relativePath) {
  return relativePath
    .split(path.sep)
    .some((segment) => ignoredSegments.has(segment));
}

function isBinary(content) {
  return content.subarray(0, Math.min(content.length, 8192)).includes(0);
}

async function listFiles(root, directory = '') {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = directory
      ? path.join(directory, entry.name)
      : entry.name;
    if (isIgnored(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function removeAllowedTemplateReferences(relativePath, content) {
  const normalizedPath = relativePath.split(path.sep).join('/');
  if (allowedTemplateSourcePaths.has(normalizedPath)) return '';
  if (!allowedUpstreamPaths.has(normalizedPath)) return content;

  return content.replaceAll(upstreamUrl, '').replaceAll(upstreamRepository, '');
}

async function main() {
  const root = process.cwd();
  const manifestPath = path.join(root, 'workspace.template.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  if (manifest.schemaVersion < 2) {
    throw new Error(
      'workspace.template.json must use identity schema version 2 or newer.',
    );
  }

  const findings = [];
  for (const relativePath of await listFiles(root)) {
    const bytes = await readFile(path.join(root, relativePath));
    if (isBinary(bytes)) continue;

    const content = removeAllowedTemplateReferences(
      relativePath,
      bytes.toString('utf-8'),
    );
    const lines = content.split('\n');
    for (const [index, line] of lines.entries()) {
      for (const [label, pattern] of forbiddenPatterns) {
        if (line.includes(pattern)) {
          findings.push(
            `${relativePath.split(path.sep).join('/')}:${index + 1}: ${label}`,
          );
          break;
        }
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(
      [
        'Generated workspace still contains template identity:',
        ...findings,
      ].join('\n'),
    );
  }

  console.log(
    'Generated workspace contains no hard-coded template identity outside approved upstream metadata.',
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
