import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDirectory, '../../../../../apps/web');
const nextEnvironmentPath = resolve(webRoot, 'next-env.d.ts');
const originalNextEnvironment = readFileSync(nextEnvironmentPath);

let forwardedSignal;
let restored = false;

function restoreNextEnvironment() {
  if (restored) return;
  writeFileSync(nextEnvironmentPath, originalNextEnvironment);
  restored = true;
}

const server = spawn(
  'pnpm',
  ['exec', 'next', 'dev', webRoot, '--hostname', '127.0.0.1', '--port', '3000'],
  {
    env: process.env,
    stdio: 'inherit',
  },
);

function forwardSignal(signal) {
  forwardedSignal = signal;
  server.kill(signal);
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

server.on('error', (error) => {
  restoreNextEnvironment();
  console.error('Unable to start the Playwright web server.', error);
  process.exitCode = 1;
});

server.on('exit', (code) => {
  restoreNextEnvironment();
  process.exitCode = forwardedSignal ? 0 : (code ?? 1);
});
