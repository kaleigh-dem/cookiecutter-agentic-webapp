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

const templateSlug = ['agentic', 'webapp'].join('-');
const templateSnakeName = ['agentic', 'webapp'].join('_');
const templateUpperSnakeName = templateSnakeName.toUpperCase();
const templateClassName = ['Agentic', 'Webapp'].join('');
const templatePropertyName = ['agentic', 'Webapp'].join('');
const upstreamRepository = [
  ['kaleigh', 'dem'].join('-'),
  ['cookiecutter', templateSlug].join('-'),
].join('/');
const upstreamUrl = `https://github.com/${upstreamRepository}`;
const personalCodeowner = `@${['kaleigh', 'dem'].join('-')}`;

const forbiddenPatterns = [
  ['template package scope or slug', templateSlug],
  ['template snake-case identity', templateSnakeName],
  ['template upper-snake identity', templateUpperSnakeName],
  ['template class identity', templateClassName],
  ['template property identity', templatePropertyName],
  ['personal CODEOWNER', personalCodeowner],
];

const allowedUpstreamPaths = new Set(['README.md', 'workspace.template.json']);

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

function removeAllowedUpstreamReferences(relativePath, content) {
  const normalizedPath = relativePath.split(path.sep).join('/');
  if (!allowedUpstreamPaths.has(normalizedPath)) return content;

  return content
    .replaceAll(upstreamUrl, '')
    .replaceAll(upstreamRepository, '');
}

async function main() {
  const root = process.cwd();
  const manifestPath = path.join(root, 'workspace.template.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  if (manifest.schemaVersion < 2) {
    throw new Error('workspace.template.json must use identity schema version 2 or newer.');
  }

  const findings = [];
  for (const relativePath of await listFiles(root)) {
    const bytes = await readFile(path.join(root, relativePath));
    if (isBinary(bytes)) continue;

    const content = removeAllowedUpstreamReferences(
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
        }
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(
      ['Generated workspace still contains template identity:', ...findings].join(
        '\n',
      ),
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
