import { defineConfig } from '@playwright/test';

/**
 * Headless e2e flows. The Angular dev server is the only process;
 * backend calls are intercepted in the browser (see e2e/experiment-studio-api.ts).
 * Every test owns its page and its mock store, so tests run in parallel.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 60_000,
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
    // Kept only for failed tests; CI uploads e2e/test-results as an artifact.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // No hot reload: under parallel first loads its component endpoint can fail and leave a blank page.
    command: 'node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4200 --no-hmr --no-live-reload',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
