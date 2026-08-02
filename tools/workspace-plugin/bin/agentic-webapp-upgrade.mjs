#!/usr/bin/env node

import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const candidates = [
  path.join(packageRoot, 'dist/template-upgrade/upgrade.mjs'),
  path.resolve(packageRoot, '../template/upgrade.mjs'),
];

for (const candidate of candidates) {
  try {
    await access(candidate);
    await import(pathToFileURL(candidate).href);
    process.exitCode ??= 0;
    break;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

if (process.exitCode === undefined) {
  throw new Error('Unable to locate the template upgrade implementation.');
}
