import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, lastRequest, test } from './fixtures';
import { addVariable, assignRole, chooseAlgorithm, goToAlgorithms, goToDataHandling, openNewStudio, prepareLinearRun, runExperiment } from './studio';

/**
 * Flows the split panels own that the studio flows above do not reach:
 * the variables panel browser views and details card, the algorithm catalog
 * (search, groups, blocked reasons, run requirements) and the result exports.
 */

test.describe('variables panel', () => {
  test('browser views, details tabs and histogram export menu', async ({ page, api }) => {
    await openNewStudio(page);
    const views = page.getByRole('group', { name: 'Metadata browser view' });
    for (const view of ['List', 'Graph', 'Map']) {
      await views.getByRole('button', { name: view }).click();
      await expect(views.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true');
    }

    await page.getByRole('button', { name: 'Search variables or groups' }).click();
    await page.locator('#search-bar').fill('Age');
    await page.locator('.search-result-item', { hasText: 'Age' }).first().click();
    const details = page.locator('#histogram-graph');
    await expect(details).toContainText('Age');
    await expect(page.locator('#histogram-tab-panel')).toContainText('Count');
    expect(lastRequest(api, 'POST', '/services/experiments/preview', 'histogram').analysis.algorithm.y).toEqual(['age']);

    await page.getByRole('tab', { name: /Details/ }).click();
    await expect(page.locator('#metadata-tab-panel')).toBeVisible();
    await page.getByRole('tab', { name: /Chart/ }).click();
    await expect(page.locator('#histogram-tab-panel')).toBeVisible();

    await details.locator('button[title="Export histogram"]').click();
    const menu = page.getByRole('menu', { name: 'Export histogram' });
    // The mocked histogram does not produce a file here (same on master); the live suite downloads one.
    await expect(menu.locator('button[title="Export CSV"]')).toBeVisible();
    await expect(menu.locator('button[title="Export PDF"]')).toBeVisible();
  });

  test('the pool adds, focuses and removes variables', async ({ page }) => {
    await openNewStudio(page);
    await addVariable(page, 'Age');
    await addVariable(page, 'Sex');
    const pool = page.locator('.pool-chip');
    await expect(pool).toHaveCount(2);
    await pool.filter({ hasText: 'Age' }).click();
    await expect(page.locator('#histogram-graph')).toContainText('Age');
    await page.locator('[data-guide="guide-add-variable"]').click();
    await expect(pool).toHaveCount(1);
    await expect(pool).toHaveText(/Sex/);
  });
});

test.describe('algorithm catalog and result', () => {
  test('search, groups, blocked reasons and run requirements', async ({ page }) => {
    await openNewStudio(page);
    await addVariable(page, 'Age');
    await addVariable(page, 'Sex');
    await goToDataHandling(page);
    await goToAlgorithms(page);
    const run = page.locator('.sub-header-cta', { hasText: 'Run experiment' });
    await expect(run).toBeDisabled();
    await expect(page.getByRole('button', { name: /^Runnable\b/ })).toHaveText(/0/);

    await assignRole(page, 'Age', 'Outcome');
    await assignRole(page, 'Sex', 'Predictor');
    await expect(page.getByRole('button', { name: /^Runnable\b/ })).not.toHaveText(/\b0\b/);

    await page.getByRole('button', { name: /^All\b/ }).click();
    const blocked = page.locator('.algo-tile.disabled-algo', { hasText: 'Logistic regression' });
    await expect(blocked).toBeVisible();
    await expect(blocked.locator('.algo-why')).not.toHaveText('');

    await page.locator('#algo-search').fill('zzz');
    await expect(page.locator('.algo-tile')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear algorithm search' }).click();
    await expect(page.locator('.algo-tile').first()).toBeVisible();

    await chooseAlgorithm(page, 'Linear regression');
    await expect(page.locator('.inspector-tag')).toHaveText('Regression');
    await expect(run).toBeEnabled();
  });

  test('a linear regression result exports a CSV ZIP and a PDF report', async ({ page }) => {
    await prepareLinearRun(page);
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();

    await page.locator('[data-guide="result-export"]').click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /ZIP/ }).click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const archive = await JSZip.loadAsync(readFileSync(await zip.path()));
    expect(Object.keys(archive.files).some((name) => name.endsWith('.csv'))).toBe(true);

    await page.locator('[data-guide="result-export"]').click();
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('menuitem', { name: /PDF/ }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe('%PDF-');

    await page.getByRole('button', { name: 'Edit parameters' }).click();
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
  });
});
