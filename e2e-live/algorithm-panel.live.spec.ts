import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { addVariable, assignRole, chooseAlgorithm, expect, goToAlgorithms, goToDataHandling, openNewStudio, runExperiment, shot, test } from './live';

/** Algorithm panel (selection: catalog, search, categories, details, parameters; result: requirements, run, errors, exports) against real specs and Exaflow runs. */

async function openAlgorithmStep(page: Page, { excludeUnloaded = true } = {}) {
  await openNewStudio(page, { excludeUnloaded });
  for (const label of ['Exact age', 'MMSE Total scores', 'Gender']) await addVariable(page, label);
  await goToDataHandling(page);
  await goToAlgorithms(page);
}

const runnable = (page: Page) => page.getByRole('button', { name: /^Runnable\b/ });
const all = (page: Page) => page.getByRole('button', { name: /^All\b/ });

test.describe('algorithm panel (live)', () => {
  test('catalog follows the roles, with search, categories and blocked reasons', async ({ page }) => {
    await openAlgorithmStep(page);
    await expect(runnable(page)).toHaveText(/Runnable\s*0/);
    await expect(page.locator('.sub-header-cta', { hasText: 'Run experiment' })).toBeDisabled();
    await shot(page, 'alg-01-no-roles');

    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await assignRole(page, 'Gender', 'Predictor');
    await expect(runnable(page)).toHaveText(/Runnable\s*3/);
    await expect(page.locator('.algo-tile:not(.disabled-algo)')).toHaveText([
      /Cox Proportional Hazards Regression/, /Linear Regression/, /Linear Mixed Model/,
    ]);
    await shot(page, 'alg-02-runnable-catalog');

    // "All" shows every method; the ones that cannot run explain why.
    await all(page).click();
    await expect(all(page)).toHaveAttribute('aria-pressed', 'true');
    const blocked = page.locator('.algo-tile.disabled-algo', { hasText: 'Logistic Regression' }).first();
    await expect(blocked).toBeVisible();
    await expect(blocked.locator('.algo-why')).not.toHaveText('');
    await shot(page, 'alg-03-all-with-blocked');

    // Groups with nothing runnable start folded; their header opens and closes them.
    const clustering = page.locator('.algorithm-match-cat', { hasText: 'Clustering' });
    await expect(clustering).toContainText('0 runnable');
    await expect(page.locator('.algo-tile', { hasText: /^\s*K-means/ })).toHaveCount(0);
    await clustering.click();
    await expect(page.locator('.algo-tile', { hasText: 'K-means' }).first()).toBeVisible();
    await clustering.click();
    await expect(page.locator('.algo-tile', { hasText: 'K-means' })).toHaveCount(0);

    // Search narrows the list; no match shows the empty state; clearing restores it.
    await page.locator('#algo-search').fill('t-test');
    for (const name of ['Independent t-test', 'One-sample t-test', 'Paired t-test']) {
      const tile = page.locator('.algo-tile', { hasText: name });
      await expect(tile).toHaveClass(/disabled-algo/);
      await expect(tile.locator('.algo-why')).toContainText(/Predictor/);
    }
    await expect(page.locator('.algo-tile', { hasText: 'Pearson Correlation' })).toHaveCount(0);
    await shot(page, 'alg-04-search-t-test');
    await page.locator('#algo-search').fill('zzz-no-such-method');
    await expect(page.locator('.algo-tile')).toHaveCount(0);
    await shot(page, 'alg-04b-search-empty');
    await page.getByRole('button', { name: 'Clear algorithm search' }).click();
    await expect(page.locator('.algo-tile').first()).toBeVisible();
  });

  test('details, documentation and the parameter form validate input', async ({ page }) => {
    await openAlgorithmStep(page);
    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await chooseAlgorithm(page, 'Linear Regression');
    await expect(page.locator('.inspector-tag')).toHaveText('Regression');
    await expect(page.locator('app-algorithm-panel')).toContainText('Needs a numerical outcome');
    await page.locator('details.documentation-panel summary').click();
    await expect(page.locator('details.documentation-panel')).toHaveAttribute('open', '');
    await shot(page, 'alg-05-linear-details-docs');

    // Cross-validation switches to the CV variant with a folds field that rejects bad values.
    await page.locator('.toggle-switch input').check({ force: true });
    const folds = page.locator('.config-option-detail input');
    await expect(folds).toBeVisible();
    await folds.fill('1');
    await folds.blur();
    await expect(page.locator('.sub-header-cta', { hasText: 'Run experiment' })).toBeDisabled();
    await shot(page, 'alg-06-cv-folds-invalid');
    await folds.fill('3');
    await folds.blur();
    await expect(page.locator('.sub-header-cta', { hasText: 'Run experiment' })).toBeEnabled();
    await shot(page, 'alg-07-cv-folds-valid');
  });

  test('a real linear regression run renders and exports PDF and ZIP', async ({ page }) => {
    await openAlgorithmStep(page);
    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await assignRole(page, 'Gender', 'Predictor');
    await chooseAlgorithm(page, 'Linear Regression');
    await expect(page.getByText(/Ready · Linear Regression/)).toBeVisible();
    await runExperiment(page);

    const result = page.locator('app-execution-panel');
    await expect(result).toContainText('subjectage ~ gender[M] + minimentalstate');
    await expect(result).toContainText('R²');
    await expect(result).toContainText(/F\(2, \d+\) = [\d.]+/);
    await expect(result.getByRole('row', { name: /MMSE Total scores/ })).toContainText(/−?\d/);
    await expect(result.getByRole('row', { name: /Intercept/ })).toContainText(/\d/);
    await expect(result).toContainText('Dementia · 30 datasets');
    await shot(page, 'alg-08-linear-result');

    await page.locator('[data-guide="result-export"]').click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /ZIP/ }).click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const archive = await JSZip.loadAsync(readFileSync(await zip.path()));
    const entries = Object.keys(archive.files);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((name) => name.endsWith('.csv'))).toBe(true);

    await page.locator('[data-guide="result-export"]').click();
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('menuitem', { name: /PDF/ }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = readFileSync(await pdf.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);

    // Edit parameters returns to the algorithm step with the selection kept.
    await page.getByRole('button', { name: 'Edit parameters' }).click();
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear Regression');
  });

  test('an engine error from Exaflow is shown on the result', async ({ page }) => {
    // Keeping the *_test datasets selected makes Exaflow reject the run for real.
    await openAlgorithmStep(page, { excludeUnloaded: false });
    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await chooseAlgorithm(page, 'Linear Regression');
    await runExperiment(page);
    await expect(page.getByText('The experiment did not finish')).toBeVisible();
    await expect(page.getByText(/could not be found for data_model/)).toBeVisible();
    await shot(page, 'alg-09-engine-error');
  });
});
