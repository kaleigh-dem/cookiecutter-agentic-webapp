import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();

await import('./steadystack-rebrand.mjs');

const ciPath = path.join(root, '.github/workflows/ci.yml');
let ci = readFileSync(ciPath, 'utf8');
ci = ci.replace(
  'permissions:\n  actions: read\n  contents: write',
  'permissions:\n  actions: read\n  contents: read',
);
writeFileSync(ciPath, ci);

const homePath = path.join(root, 'wiki/Home.md');
let home = readFileSync(homePath, 'utf8');
home = home.replace(
  /^# Nx Fullstack Platform: Agentic Web Application Template\n\nNx Fullstack Platform is /u,
  '# SteadyStack\n\nSteadyStack is ',
);
writeFileSync(homePath, home);

const sidebarPath = path.join(root, 'wiki/_Sidebar.md');
let sidebar = readFileSync(sidebarPath, 'utf8');
sidebar = sidebar.replace(/^# Nx Fullstack Platform$/mu, '# SteadyStack');
writeFileSync(sidebarPath, sidebar);

rmSync(fileURLToPath(import.meta.url));
