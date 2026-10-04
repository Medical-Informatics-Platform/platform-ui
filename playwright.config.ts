import { defineConfig } from '@playwright/test';

/**
 * Headless experiment-studio flows. The Angular dev server is the only process;
 * backend calls are intercepted in the browser (see e2e/experiment-studio-api.ts).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'experiment-studio.flows.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: 'e2e/test-results',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4200',
    headless: true,
    // Local machines use installed Chrome. CI uses Playwright's Chromium.
    ...(process.env.CI ? {} : { channel: 'chrome' as const }),
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
  },
  webServer: {
    command: 'node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4200',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
