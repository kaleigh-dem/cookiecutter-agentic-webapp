import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const ciPath = path.join(root, '.github/workflows/ci.yml');

execFileSync('pnpm', ['format'], { cwd: root, stdio: 'inherit' });

let ci = readFileSync(ciPath, 'utf8');
ci = ci.replace(
  'permissions:\n  actions: read\n  contents: write',
  'permissions:\n  actions: read\n  contents: read',
);
ci = ci.replace(
  /\n      # BEGIN STEADYSTACK FORMAT BOOTSTRAP[\s\S]*?      # END STEADYSTACK FORMAT BOOTSTRAP\n/u,
  '\n',
);
writeFileSync(ciPath, ci);

rmSync(fileURLToPath(import.meta.url));
execFileSync('pnpm', ['exec', 'prettier', '--write', '.github/workflows/ci.yml'], {
  cwd: root,
  stdio: 'inherit',
});
