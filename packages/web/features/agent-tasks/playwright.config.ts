import { defineConfig } from '@playwright/test';

const usePreviewImage = process.env.PLAYWRIGHT_USE_PREVIEW_IMAGE === 'true';
const diagnosticsDirectory =
  process.env.CI_DIAGNOSTICS_DIR ?? 'test-output/ci-diagnostics';

export default defineConfig({
  testDir: './e2e',
  outputDir: `${diagnosticsDirectory}/playwright-results`,
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: `${diagnosticsDirectory}/playwright-report`,
      },
    ],
  ],
  use: {
    baseURL: usePreviewImage
      ? 'http://localhost:3000'
      : 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: usePreviewImage
    ? undefined
    : {
        command:
          'pnpm exec next dev ../../../../apps/web --hostname 127.0.0.1 --port 3000',
        url: 'http://127.0.0.1:3000/agent-tasks',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
