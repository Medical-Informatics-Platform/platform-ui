import { expect, test as base } from '@playwright/test';
import { installExperimentStudioApi, RecordedRequest, StudioApi } from './experiment-studio-api';

/**
 * Every test gets a page whose `/services` calls go to the in-browser mock (`api`).
 * Guided tours are marked as seen, and the test fails if the app called an endpoint
 * the mock does not answer.
 */
export const test = base.extend<{ api: StudioApi }>({
  api: [async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('mip.guide.experiments-dashboard.autostarted', 'true');
      localStorage.setItem('mip.guide.experiment-studio.seen', 'true');
      localStorage.setItem('mip.guide.experiment-studio.autostarted', 'true');
    });
    const api = await installExperimentStudioApi(page);
    await use(api);
    expect(api.unhandled, 'calls to /services the mock does not answer').toEqual([]);
  }, { auto: true }],
});

export { expect };

/** The body of the latest request to `path` (and algorithm `name`, for runs and previews). */
export function lastRequest(api: StudioApi, method: string, path: string, name?: string): RecordedRequest['body'] {
  const match = api.requests.filter(
    (request) => request.method === method && request.path === path && (!name || request.body?.analysis?.algorithm?.name === name),
  );
  expect(match.length, `${method} ${path}${name ? ` (${name})` : ''} was sent`).toBeGreaterThan(0);
  return match[match.length - 1].body;
}
