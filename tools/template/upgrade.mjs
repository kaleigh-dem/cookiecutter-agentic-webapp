#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseArguments(argv) {
  const options = { apply: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === '--') continue;
    if (!entry.startsWith('--')) {
      throw new Error(`Unexpected argument: ${entry}`);
    }

    const [rawKey, inlineValue] = entry.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) =>
      letter.toUpperCase(),
    );
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    if (key === 'apply' || key === 'dryRun') {
      options[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawKey}.`);
    }
    options[key] = value;
    index += 1;
  }

  if (options.apply && options.dryRun) {
    throw new Error('--apply and --dry-run are mutually exclusive.');
  }
  return options;
}

function parseVersion(value) {
  const match = typeof value === 'string' ? value.match(versionPattern) : null;
  if (!match) {
    throw new Error(`Invalid semantic version: ${String(value)}`);
  }
  return {
    value,
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = a.numbers[index] - b.numbers[index];
    if (difference !== 0) return Math.sign(difference);
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  return a.prerelease.join('.').localeCompare(b.prerelease.join('.'));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeJson(current, patch) {
  if (!isPlainObject(current) || !isPlainObject(patch)) return patch;
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    result[key] =
      isPlainObject(value) && isPlainObject(result[key])
        ? mergeJson(result[key], value)
        : value;
  }
  return result;
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function patternMatches(pattern, relativePath) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }
  return pattern === relativePath;
}

function ownershipFor(policy, relativePath) {
  for (const [ownership, entries] of Object.entries(policy.classes)) {
    if (entries.some((entry) => patternMatches(entry.pattern, relativePath))) {
      return ownership;
    }
  }
  return 'unclassified';
}

async function loadMigrations() {
  const migrationsRoot = path.join(toolRoot, 'migrations');
  const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const migrations = [];
  for (const entry of entries) {
    const module = await import(
      pathToFileURL(path.join(migrationsRoot, entry.name)).href
    );
    const migration = module.default;
    if (
      !migration ||
      typeof migration.id !== 'string' ||
      typeof migration.from !== 'string' ||
      typeof migration.to !== 'string' ||
      !Array.isArray(migration.operations)
    ) {
      throw new Error(`Invalid migration module: ${entry.name}`);
    }
    parseVersion(migration.from);
    parseVersion(migration.to);
    migrations.push({ ...migration, fileName: entry.name });
  }
  return migrations;
}

function migrationPath(migrations, fromVersion, toVersion) {
  if (compareVersions(fromVersion, toVersion) > 0) {
    throw new Error(
      `Downgrades are not supported: ${fromVersion} is newer than ${toVersion}.`,
    );
  }

  const selected = [];
  let current = fromVersion;
  while (current !== toVersion) {
    const candidates = migrations.filter(
      (migration) =>
        migration.from === current &&
        compareVersions(migration.to, toVersion) <= 0,
    );
    if (candidates.length !== 1) {
      throw new Error(
        candidates.length === 0
          ? `No migration path exists from ${current} to ${toVersion}.`
          : `Migration path from ${current} is ambiguous: ${candidates
              .map((migration) => migration.id)
              .join(', ')}.`,
      );
    }
    const [migration] = candidates;
    selected.push(migration);
    current = migration.to;
  }
  return selected;
}

async function managedAssetOperations(policy) {
  const migrationsRoot = path.join(toolRoot, 'migrations');
  const migrationFiles = (
    await readdir(migrationsRoot, { withFileTypes: true })
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const assets = [
    {
      source: path.join(toolRoot, 'upgrade.mjs'),
      path: 'tools/template/upgrade.mjs',
    },
    {
      source: path.join(toolRoot, 'ownership.json'),
      path: 'tools/template/ownership.json',
    },
    ...migrationFiles.map((entry) => ({
      source: path.join(migrationsRoot, entry.name),
      path: `tools/template/migrations/${entry.name}`,
    })),
  ];

  return assets.map((asset) => ({
    type: 'copy-managed',
    ...asset,
    description: 'Synchronize template-managed upgrade infrastructure.',
    ownership: ownershipFor(policy, asset.path),
  }));
}

async function planOperation(workspace, policy, operation) {
  const destination = path.join(workspace, operation.path);
  const ownership = operation.ownership ?? ownershipFor(policy, operation.path);
  const before = await readOptional(destination);
  let after;
  let conflict = null;

  if (operation.type === 'merge-json') {
    if (before === null) {
      conflict = `${operation.path} is required for a structured migration but is missing.`;
    } else {
      try {
        after = `${JSON.stringify(
          mergeJson(JSON.parse(before), operation.patch),
          null,
          2,
        )}\n`;
      } catch (error) {
        conflict = `${operation.path} is not valid JSON: ${error.message}`;
      }
    }
  } else if (operation.type === 'create-file') {
    after = operation.content.endsWith('\n')
      ? operation.content
      : `${operation.content}\n`;
    if (before !== null && before !== after) {
      conflict = `${operation.path} already exists with downstream content; preserve it and apply the documented guidance manually.`;
    }
  } else if (operation.type === 'copy-managed') {
    after = await readFile(operation.source, 'utf-8');
  } else {
    throw new Error(`Unsupported migration operation: ${operation.type}`);
  }

  const status = conflict
    ? 'conflict'
    : before === after
      ? 'unchanged'
      : before === null
        ? 'create'
        : 'update';
  return {
    ...operation,
    destination,
    ownership,
    before,
    after,
    conflict,
    status,
  };
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.template-upgrade-${process.pid}`;
  await writeFile(temporary, content);
  await rename(temporary, filePath);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const workspace = path.resolve(options.workspace ?? process.cwd());
  const manifestPath = path.join(workspace, 'workspace.template.json');
  const [policy, manifest, migrations] = await Promise.all([
    readJson(path.join(toolRoot, 'ownership.json')),
    readJson(manifestPath),
    loadMigrations(),
  ]);

  const fromVersion = manifest.upstream?.version;
  if (typeof fromVersion !== 'string') {
    throw new Error(
      'workspace.template.json must contain upstream.version before it can be upgraded.',
    );
  }
  parseVersion(fromVersion);

  const latestVersion = migrations
    .map((migration) => migration.to)
    .sort(compareVersions)
    .at(-1);
  const toVersion = options.to ?? latestVersion;
  if (!toVersion) {
    throw new Error('No target version was provided and no migrations exist.');
  }
  parseVersion(toVersion);

  const selectedMigrations = migrationPath(migrations, fromVersion, toVersion);
  const operations = [
    ...selectedMigrations.flatMap((migration) =>
      migration.operations.map((operation) => ({
        ...operation,
        migration: migration.id,
      })),
    ),
    ...(await managedAssetOperations(policy)),
  ];
  const planned = [];
  for (const operation of operations) {
    planned.push(await planOperation(workspace, policy, operation));
  }

  const conflicts = planned
    .filter((operation) => operation.conflict)
    .map((operation) => ({
      path: operation.path,
      ownership: operation.ownership,
      message: operation.conflict,
    }));
  const mode = options.apply ? 'apply' : 'dry-run';
  const report = {
    mode,
    workspace,
    fromVersion,
    toVersion,
    migrations: selectedMigrations.map((migration) => ({
      id: migration.id,
      from: migration.from,
      to: migration.to,
      summary: migration.summary,
    })),
    changes: planned.map((operation) => ({
      path: operation.path,
      ownership: operation.ownership,
      action: operation.type,
      status: operation.status,
      migration: operation.migration ?? null,
      description: operation.description,
    })),
    conflicts,
    guidance: [
      'Template-managed upgrade files may be replaced only by the verified release artifact running this command.',
      'Generated-once files receive explicit structured edits; customized files are reported as conflicts.',
      'Application-owned files are never overwritten automatically.',
      conflicts.length > 0
        ? 'Resolve conflicts manually, then rerun the dry run before applying.'
        : options.apply
          ? 'Run the repository validation contract and commit the upgrade separately from application changes.'
          : 'Review this report, commit or stash current work, then rerun with --apply.',
    ],
  };

  if (conflicts.length > 0) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
    return;
  }

  if (options.apply) {
    for (const operation of planned) {
      if (operation.status === 'create' || operation.status === 'update') {
        await writeAtomically(operation.destination, operation.after);
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
