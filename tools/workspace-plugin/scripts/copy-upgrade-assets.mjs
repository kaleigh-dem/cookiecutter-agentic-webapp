import { chmod, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.cwd();
const sourceRoot = path.join(workspaceRoot, 'tools/template');
const destinations = [
  path.join(workspaceRoot, 'dist/tools/workspace-plugin/template-upgrade'),
  path.join(workspaceRoot, 'tools/workspace-plugin/dist/template-upgrade'),
];

for (const destination of destinations) {
  await rm(destination, { force: true, recursive: true });
  await mkdir(path.join(destination, 'migrations'), { recursive: true });
  await cp(
    path.join(sourceRoot, 'upgrade.mjs'),
    path.join(destination, 'upgrade.mjs'),
  );
  await chmod(path.join(destination, 'upgrade.mjs'), 0o755);
  await cp(
    path.join(sourceRoot, 'ownership.json'),
    path.join(destination, 'ownership.json'),
  );
  await cp(
    path.join(sourceRoot, 'migrations'),
    path.join(destination, 'migrations'),
    { recursive: true },
  );
}
