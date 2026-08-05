import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const selfPath = 'tools/template/steadystack-rebrand.mjs';
const artifactRoot = '/tmp/steadystack-migration-artifact';
const historicalPaths = new Set([
  'CHANGELOG.md',
  'tools/template/migrations/0.1.0-to-0.2.0.mjs',
]);

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

function isHistorical(pathname) {
  return (
    historicalPaths.has(pathname) ||
    /^docs\/adr\/00(?:0[1-9]|1[0-6])-/.test(pathname) ||
    pathname.startsWith('tools/template/fixtures/upgrade-0.1.0/')
  );
}

function isText(buffer) {
  return !buffer.includes(0);
}

const replacements = [
  ['https://github.com/kaleigh-dem/nx-fullstack-platform', 'https://github.com/kaleigh-dem/steady-stack'],
  ['git@github.com:kaleigh-dem/nx-fullstack-platform.git', 'git@github.com:kaleigh-dem/steady-stack.git'],
  ['nx-fullstack-platform.wiki.git', 'steady-stack.wiki.git'],
  ['kaleigh-dem/nx-fullstack-platform', 'kaleigh-dem/steady-stack'],
  ['nx-fullstack-platform', 'steady-stack'],
  ['Agentic Webapp Nx Template', 'SteadyStack'],
  ['Agentic Webapp', 'SteadyStack'],
  ['agentic-webapp-workspace-plugin', 'steadystack-workspace-plugin'],
  ['agentic-webapp-upgrade', 'steadystack-upgrade'],
  ['@agentic-webapp', '@steadystack'],
  ['agentic_webapp', 'steadystack'],
  ['AgenticWebapp', 'SteadyStack'],
  ['agenticWebapp', 'steadystack'],
  ['AGENTIC_WEBAPP', 'STEADYSTACK'],
  ['agentic-webapp', 'steadystack'],
  ['agentic web application template', 'SteadyStack'],
  ['Agentic web application template', 'SteadyStack'],
];

let renamedReferences = 0;
for (const pathname of trackedFiles()) {
  if (pathname === selfPath || isHistorical(pathname)) continue;
  const absolute = path.join(root, pathname);
  const buffer = readFileSync(absolute);
  if (!isText(buffer)) continue;
  let content = buffer.toString('utf8');
  const original = content;
  for (const [before, after] of replacements) {
    const occurrences = content.split(before).length - 1;
    if (occurrences > 0) {
      renamedReferences += occurrences;
      content = content.split(before).join(after);
    }
  }
  if (content !== original) writeFileSync(absolute, content);
}

const oldBin = path.join(root, 'tools/workspace-plugin/bin/agentic-webapp-upgrade.mjs');
const newBin = path.join(root, 'tools/workspace-plugin/bin/steadystack-upgrade.mjs');
if (existsSync(oldBin)) {
  renameSync(oldBin, newBin);
  renamedReferences += 1;
}

const releasePath = path.join(root, 'tools/template/release.mjs');
let release = readFileSync(releasePath, 'utf8');
const canonicalBinBlock = `    bin: {\n      'steadystack-upgrade': './bin/steadystack-upgrade.mjs',\n    },`;
const compatibilityBinBlock = `    // The 0.2.0 artifact publicly exposed agentic-webapp-upgrade. Keep a\n    // deprecated alias so previously generated workspaces can reach the new runner.\n    bin: {\n      'steadystack-upgrade': './bin/steadystack-upgrade.mjs',\n      'agentic-webapp-upgrade': './bin/steadystack-upgrade.mjs',\n    },`;
if (!release.includes(canonicalBinBlock)) {
  throw new Error('Unable to locate the packaged bin contract.');
}
release = release.replace(canonicalBinBlock, compatibilityBinBlock);
writeFileSync(releasePath, release);

const smokePath = path.join(root, 'tools/template/smoke-release-artifact.mjs');
let smoke = readFileSync(smokePath, 'utf8');
const canonicalDryRun = `  const dryRun = JSON.parse(\n    capture(workspace, 'pnpm', [\n      'exec',\n      'steadystack-upgrade',`;
const compatibilityDryRun = `  // Exercise the deprecated 0.2.0 alias once; apply through the canonical command below.\n  const dryRun = JSON.parse(\n    capture(workspace, 'pnpm', [\n      'exec',\n      'agentic-webapp-upgrade',`;
if (!smoke.includes(canonicalDryRun)) {
  throw new Error('Unable to locate the release upgrade smoke command.');
}
smoke = smoke.replace(canonicalDryRun, compatibilityDryRun);
writeFileSync(smokePath, smoke);

const readmePath = path.join(root, 'README.md');
const readmeLines = readFileSync(readmePath, 'utf8').split('\n');
readmeLines[0] = '# SteadyStack';
writeFileSync(readmePath, readmeLines.join('\n'));

const pluginPackagePath = path.join(root, 'tools/workspace-plugin/package.json');
const pluginPackage = JSON.parse(readFileSync(pluginPackagePath, 'utf8'));
pluginPackage.description = 'Nx preset, generators, and upgrade tooling for SteadyStack';
writeFileSync(pluginPackagePath, `${JSON.stringify(pluginPackage, null, 2)}\n`);

const changelogPath = path.join(root, 'CHANGELOG.md');
let changelog = readFileSync(changelogPath, 'utf8');
const changelogMarker = '## [Unreleased]\n';
const changelogEntry = `\n### Changed\n\n- Adopt the SteadyStack public identity across packages, generators, upgrades, release artifacts, generated-workspace metadata, workflows, runtime defaults, documentation, and future repository links.\n`;
if (!changelog.includes(changelogEntry.trim())) {
  if (!changelog.includes(changelogMarker)) {
    throw new Error('CHANGELOG.md is missing the Unreleased marker.');
  }
  changelog = changelog.replace(changelogMarker, `${changelogMarker}${changelogEntry}`);
  writeFileSync(changelogPath, changelog);
}

const migrationDocument = `# SteadyStack identity migration\n\nSteadyStack is the canonical public identity for this Nx platform. The repository remains a production-minded platform for humans and coding agents; the migration changes public names and identity-owned defaults, not the agentic-development model.\n\n## Canonical names\n\n| Contract | Previous | SteadyStack |\n| --- | --- | --- |\n| GitHub repository | \`kaleigh-dem/nx-fullstack-platform\` | \`kaleigh-dem/steady-stack\` |\n| Display name | \`Agentic Webapp Nx Template\` | \`SteadyStack\` |\n| Package scope | \`@agentic-webapp\` | \`@steadystack\` |\n| Root package | \`@agentic-webapp/source\` | \`@steadystack/source\` |\n| Nx plugin | \`@agentic-webapp/workspace-plugin\` | \`@steadystack/workspace-plugin\` |\n| Upgrade executable | \`agentic-webapp-upgrade\` | \`steadystack-upgrade\` |\n| Release artifact basename | \`agentic-webapp-workspace-plugin\` | \`steadystack-workspace-plugin\` |\n\n## Package and generator impact\n\nAll repository-owned packages and imports move to the \`@steadystack\` scope. Generator commands use \`@steadystack/workspace-plugin\`, including the \`preset\`, \`domain\`, \`feature\`, \`job\`, and \`contract\` generators. Reinstall dependencies after updating manifests so the workspace lockfile and links agree.\n\n## Upgrade compatibility\n\nThe canonical executable is \`steadystack-upgrade\`. Version 0.2.0 publicly shipped \`agentic-webapp-upgrade\`, so the release package retains that name as a deprecated alias to the same runner. The release smoke test exercises the alias against the 0.1.0 fixture and applies the migration with the canonical command. Existing repository-local \`pnpm template:upgrade\` commands continue to work. New documentation and generated instructions use only \`steadystack-upgrade\`.\n\nThe 0.1.0 fixture and its ordered migration intentionally retain former package and template identifiers as legacy input. They are not current defaults.\n\n## Generated workspaces\n\nNew workspaces record the SteadyStack upstream repository and package contract while still choosing their own unrelated application slug, display name, package scope, database, services, and image names. Existing generated workspaces keep their downstream identity. Updating upstream provenance does not rename an adopter's application. Consumers should run the upgrade command, review reported conflicts, apply the migration, reinstall dependencies, and run their normal validation contract.\n\n## Release artifacts and repository rename\n\nCurrent and future tarballs use \`steadystack-workspace-plugin-<version>.tgz\`. Tracked source links, provenance, badges, wiki publication, and repository metadata point to \`kaleigh-dem/steady-stack\`, but this pull request does not change the GitHub repository setting. GitHub repository renaming and integration verification happen after merge.\n\n## Consumer checklist\n\n1. Replace repository-owned \`@agentic-webapp/*\` dependencies and imports with \`@steadystack/*\`.\n2. Replace generator invocations with \`@steadystack/workspace-plugin\`.\n3. Use \`steadystack-upgrade\` for direct upgrades; treat the former command as temporary compatibility only.\n4. Update artifact discovery and download automation to \`steadystack-workspace-plugin-<version>.tgz\`.\n5. Reinstall with the supported pnpm version and run formatting, type checking, tests, builds, template identity checks, release artifact smoke tests, and generated-workspace validation.\n6. After the GitHub rename, update local remotes, trusted checkout paths, wiki remotes, package publishing permissions, badges, and external integrations.\n`;
writeFileSync(path.join(root, 'docs/steadystack-migration.md'), migrationDocument);

const adr = `# ADR 0017: Adopt the SteadyStack public identity\n\n- Status: accepted\n- Date: 2026-08-05\n\n## Context\n\nThe platform's former template, package, executable, artifact, and repository names were coupled to an early implementation label. They now appear throughout source imports, generators, release tooling, runtime defaults, generated-workspace provenance, workflows, and documentation. A partial rename would create incompatible package graphs and ambiguous upgrade behavior.\n\nThe repository's agent, coding-agent, agentic-development, and agent-compatible terminology describes the operating model and is not part of the former brand.\n\n## Decision\n\nAdopt \`SteadyStack\` as the exact display name, \`steadystack\` as the lowercase technical prefix, \`@steadystack\` as the package scope, \`@steadystack/source\` as the root package, \`@steadystack/workspace-plugin\` as the public Nx plugin, \`steadystack-upgrade\` as the canonical executable, and \`steadystack-workspace-plugin\` as the release artifact basename. Prepare tracked repository references for the future GitHub rename from \`kaleigh-dem/nx-fullstack-platform\` to \`kaleigh-dem/steady-stack\`.\n\nRetain the former upgrade executable as a deprecated alias because version 0.2.0 exposed it publicly. Retain former identities only in historical records, the 0.1.0 compatibility fixture, its ordered migration input, and explicit migration guidance. Generated downstream workspaces remain free to choose identities unrelated to SteadyStack.\n\n## Consequences\n\nAll active repository-owned packages, imports, commands, artifacts, provenance, runtime identity defaults, and links use SteadyStack. Existing consumers have an explicit migration path and a tested temporary executable alias. Historical ADRs and release records remain truthful. The GitHub repository setting, publishing permissions, wiki remote, trusted reviewer checkout, and external integrations require post-merge verification.\n`;
writeFileSync(path.join(root, 'docs/adr/0017-steadystack-public-identity.md'), adr);

const ciPath = path.join(root, '.github/workflows/ci.yml');
let ci = readFileSync(ciPath, 'utf8');
ci = ci.replace(/\n      # BEGIN STEADYSTACK BOOTSTRAP[\s\S]*?      # END STEADYSTACK BOOTSTRAP\n/u, '\n');
writeFileSync(ciPath, ci);

rmSync(path.join(root, selfPath));

const oldPatterns = [
  'Agentic Webapp Nx Template',
  'Agentic Webapp',
  '@agentic-webapp',
  'agentic-webapp-workspace-plugin',
  'agentic-webapp-upgrade',
  'agentic-webapp',
  'nx-fullstack-platform.wiki.git',
  'kaleigh-dem/nx-fullstack-platform',
  'nx-fullstack-platform',
];

function residualClass(pathname) {
  if (pathname === 'CHANGELOG.md' || /^docs\/adr\/00(?:0[1-9]|1[0-6])-/.test(pathname)) {
    return 'historical_record';
  }
  if (pathname.startsWith('tools/template/fixtures/upgrade-0.1.0/')) {
    return 'compatibility_fixture';
  }
  if (pathname === 'tools/template/migrations/0.1.0-to-0.2.0.mjs') {
    return 'migration_input';
  }
  if (
    pathname === 'tools/template/release.mjs' ||
    pathname === 'tools/template/smoke-release-artifact.mjs'
  ) {
    return 'external_compatibility_reference';
  }
  if (
    pathname === 'docs/steadystack-migration.md' ||
    pathname === 'docs/adr/0017-steadystack-public-identity.md'
  ) {
    return 'migration_guidance';
  }
  return 'accidental_unresolved_reference';
}

const finalFiles = [
  ...trackedFiles().filter((pathname) => existsSync(path.join(root, pathname))),
  'docs/steadystack-migration.md',
  'docs/adr/0017-steadystack-public-identity.md',
  'tools/workspace-plugin/bin/steadystack-upgrade.mjs',
];
const residuals = [];
for (const pathname of [...new Set(finalFiles)].sort()) {
  const absolute = path.join(root, pathname);
  const buffer = readFileSync(absolute);
  if (!isText(buffer)) continue;
  const content = buffer.toString('utf8');
  for (const pattern of oldPatterns) {
    let index = content.indexOf(pattern);
    while (index >= 0) {
      residuals.push({
        path: pathname,
        pattern,
        classification: residualClass(pathname),
      });
      index = content.indexOf(pattern, index + pattern.length);
    }
  }
}
const accidental = residuals.filter(
  ({ classification }) => classification === 'accidental_unresolved_reference',
);
if (accidental.length > 0) {
  throw new Error(`Accidental residual identities remain: ${JSON.stringify(accidental, null, 2)}`);
}

const diffFiles = execFileSync('git', ['diff', '--name-only'], {
  cwd: root,
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const untrackedFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const filesChanged = [...new Set([...diffFiles, ...untrackedFiles])].sort();
const classificationCounts = Object.fromEntries(
  [...new Set(residuals.map(({ classification }) => classification))]
    .sort()
    .map((classification) => [
      classification,
      residuals.filter((entry) => entry.classification === classification).length,
    ]),
);

rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(artifactRoot, { recursive: true });
const report = {
  baseSha: '618c6383ded604e5d274abea24f3095d8caedb5b',
  renamedReferences,
  filesChanged,
  residuals,
  classificationCounts,
  accidentalResidualCount: accidental.length,
};
writeFileSync(
  path.join(artifactRoot, 'steadystack-migration-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
execFileSync(
  'tar',
  [
    '-czf',
    path.join(artifactRoot, 'steadystack-repository.tar.gz'),
    '--exclude=.git',
    '--exclude=node_modules',
    '--exclude=dist',
    '--exclude=test-output',
    '.',
  ],
  { cwd: root, stdio: 'inherit' },
);
console.log(JSON.stringify(report, null, 2));
