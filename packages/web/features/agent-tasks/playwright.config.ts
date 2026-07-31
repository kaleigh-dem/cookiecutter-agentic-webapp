import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'pnpm nx dev web',
    url: 'http://127.0.0.1:3000/agent-tasks',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
