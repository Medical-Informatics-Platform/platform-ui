import { defineConfig } from '@playwright/test';

/**
 * Live integration flows: no mocks. The browser talks to a running platform
 * (UI + platform-backend + Exaflow with the demo data models), by default the
 * local stack started by .local-dev/start-all.sh on :4200. Override with LIVE_BASE_URL.
 * Real federated runs take seconds, so timeouts are longer and tests run serially.
 */
export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 2,
  timeout: 180_000,
  expect: { timeout: 45_000 },
  outputDir: 'e2e-live/test-results',
  reporter: 'list',
  use: {
    baseURL: process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:4200',
    headless: true,
    ...(process.env.CI ? {} : { channel: 'chrome' as const }),
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
});
