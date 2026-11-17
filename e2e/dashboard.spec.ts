import { Page } from '@playwright/test';
import { seedLinearAnalysis } from './analysis-studio-api';
import { expect, lastRequest, test } from './fixtures';
import { goToAlgorithms, goToDataHandling, runAnalysis, saveAnalysis } from './studio';

/** Dashboard actions on saved analyses, against the mocked `/services` API. */

async function openAnalysis(page: Page, name: string) {
  await page.goto('/analyses-dashboard');
  await page.getByRole('option', { name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function moreActions(page: Page, action: string) {
  await page.getByLabel('More actions').click();
  await page.locator('.detail-more-menu').getByRole('button', { name: action }).click();
}

test.describe('analyses dashboard', () => {
  test.beforeEach(({ api }) => {
    api.analyses.push(seedLinearAnalysis());
  });

  test('rename an analysis', async ({ page, api }) => {
    await openAnalysis(page, 'Baseline age model');
    await moreActions(page, 'Rename');
    const editor = page.locator('.title-edit-group');
    await editor.locator('input').fill('Age model v2');
    await editor.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'Age model v2' })).toBeVisible();
    expect(lastRequest(api, 'PATCH', '/services/analyses/exp-seed-1')).toEqual({ name: 'Age model v2' });
  });

  test('share an analysis', async ({ page, api }) => {
    await openAnalysis(page, 'Baseline age model');
    await page.getByRole('button', { name: 'Share', exact: true }).click();

    const share = page.locator('.share-btn');
    await expect(share).toHaveText('Shared');
    await expect(share).toHaveAttribute('title', 'Stop sharing');
    expect(lastRequest(api, 'PATCH', '/services/analyses/exp-seed-1')).toEqual({ shared: true });
  });

  test('delete an analysis', async ({ page, api }) => {
    await openAnalysis(page, 'Baseline age model');
    await moreActions(page, 'Delete…');
    await expect(page.getByRole('heading', { name: 'Delete analysis?' })).toBeVisible();
    await page.locator('.dialog-actions').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('option', { name: /Baseline age model/ })).toHaveCount(0);
    expect(api.requests.some((request) => request.method === 'DELETE' && request.path === '/services/analyses/exp-seed-1')).toBe(true);
    expect(api.analyses).toHaveLength(0);
  });

  test('a failed delete puts the analysis back', async ({ page }) => {
    await page.route('**/services/analyses/exp-seed-1', (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 500, json: {} }) : route.fallback(),
    );
    await openAnalysis(page, 'Baseline age model');
    await moreActions(page, 'Delete…');
    await page.locator('.dialog-actions').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Failed to delete analysis.' })).toBeVisible();
    await expect(page.getByRole('option', { name: /Baseline age model/ })).toBeVisible();
  });

  test('compare two analyses side by side', async ({ page, api }) => {
    api.analyses.push(seedLinearAnalysis({ uuid: 'exp-seed-2', name: 'Strict age model', analysisRequest: {
      ...seedLinearAnalysis().analysisRequest,
      algorithm: { name: 'linear_regression', y: ['age'], x: ['sex'], parameters: { alpha: 0.01 } },
    } }));
    await page.goto('/analyses-dashboard');
    for (const name of ['Baseline age model', 'Strict age model']) {
      await page.getByRole('option', { name }).getByLabel('Select for compare').click();
    }
    await page.getByRole('button', { name: 'Compare 2' }).click();

    await expect(page.getByRole('heading', { name: '2 analyses side by side' })).toBeVisible();
    const heads = page.locator('.compare-diff-name');
    await expect(heads).toHaveText(['Baseline age model', 'Strict age model']);
  });

  test('duplicate a saved analysis into a new one', async ({ page, api }) => {
    await page.goto('/analysis-studio?analysisId=exp-seed-1&mode=duplicate');
    await expect(page.locator('.pool-chip', { hasText: 'Age' })).toBeVisible();
    await goToDataHandling(page);
    await goToAlgorithms(page);
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
    await runAnalysis(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
    await saveAnalysis(page, 'Copy of baseline');
    await expect(page.getByText('Analysis saved successfully!')).toBeVisible();

    // A new analysis is created; the original is not touched.
    const body = api.analyses[0] as any;
    expect(body.analysisRequest).toEqual(lastRequest(api, 'POST', '/services/analyses/runs', 'linear_regression').analysisRequest);
    expect(body.name).toBe('Copy of baseline');
    expect(body.analysisRequest.algorithm).toMatchObject({ name: 'linear_regression', y: ['age'], x: ['sex'], parameters: { alpha: 0.05 } });
    expect(api.requests.some((request) => request.method === 'PATCH')).toBe(false);
    expect(api.analyses.map((analysis) => analysis.name)).toEqual(['Copy of baseline', 'Baseline age model']);
  });
});
