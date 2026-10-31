import { addVariable, expect, openNewStudio, searchVariable, shot, test } from './live';

/** Variables panel (model browser + variable details) against the real metadata and Exaflow histograms. */
test.describe('variables panel (live)', () => {
  test('model browser lists the real data models, datasets and browser views', async ({ page }) => {
    await openNewStudio(page);
    const browser = page.locator('#data-model-visualization');
    await expect(browser).toBeVisible();
    await shot(page, 'vp-01-initial-map');

    // Study context: the three demo data models and their datasets.
    const chip = page.locator('.study-context-chip');
    await expect(chip).toContainText(/\d+ datasets/);
    await chip.click();
    for (const model of ['Dementia', 'Dementia longitudinal', 'Traumatic Brain Injury']) {
      await expect(page.locator('.data-model-chip', { hasText: new RegExp(`^\\s*${model}`) }).first()).toBeVisible();
    }
    await shot(page, 'vp-02-study-context');
    await chip.click();

    // The three browser views render the hierarchy.
    const views = page.getByRole('group', { name: 'Metadata browser view' });
    for (const view of ['List', 'Graph', 'Map']) {
      await views.getByRole('button', { name: view }).click();
      await expect(views.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true');
      await expect(browser).toContainText(/Demographics/);
      await shot(page, `vp-03-view-${view.toLowerCase()}`);
    }
  });

  test('search, details tabs and the Exaflow histogram for a real and a nominal variable', async ({ page }) => {
    await openNewStudio(page);
    const details = page.locator('#histogram-graph');
    const chart = page.locator('#histogram-tab-panel');

    await searchVariable(page, 'Exact age');
    await expect(details).toContainText('Exact age');
    await expect(chart.locator('svg, canvas').first()).toBeVisible();
    await expect(chart).toContainText(/count/i);
    await shot(page, 'vp-04-exact-age-histogram');

    await expect(chart).toContainText(/hidden \(too few records per bin for privacy\)/);

    // Split options: Dataset is offered but blocked above 8 categories (30 datasets here);
    // a nominal variable in the experiment (Gender) becomes a split option.
    const split = page.locator('#histogram-split-select');
    const datasetOption = split.locator('option', { hasText: 'Dataset' });
    await expect(datasetOption).toBeDisabled();
    await expect(datasetOption).toHaveAttribute('title', /Too many datasets \(30\)\. Split is limited to 8 categories\./);
    await addVariable(page, 'Gender');
    await addVariable(page, 'Exact age');
    await page.locator('.pool-chip', { hasText: 'Exact age' }).click();
    await expect(split.locator('option', { hasText: 'Gender' })).toBeEnabled();
    await split.selectOption({ label: 'Gender' });
    await expect(chart).toContainText('Male');
    await expect(chart).toContainText('Female');
    await shot(page, 'vp-05-exact-age-split-by-gender');
    await split.selectOption({ label: 'None' });
    await expect(chart).not.toContainText('Female');

    await page.getByRole('tab', { name: /Details/ }).click();
    await expect(page.locator('#metadata-tab-panel')).toBeVisible();
    await expect(page.locator('#metadata-tab-panel')).toContainText(/real/i);
    await shot(page, 'vp-06-exact-age-details-tab');
    await page.getByRole('tab', { name: /Chart/ }).click();

    await page.locator('.pool-chip', { hasText: 'Gender' }).click();
    await expect(details).toContainText('Gender');
    await expect(chart).toContainText('Male');
    await expect(chart).toContainText('Female');
    await shot(page, 'vp-07-gender-histogram');

    // Histogram export menu offers CSV and PDF.
    await details.locator('button[title="Export histogram"]').click();
    const menu = page.getByRole('menu', { name: 'Export histogram' });
    await expect(menu.locator('button')).toHaveCount(2);
    const [csv] = await Promise.all([page.waitForEvent('download'), menu.locator('button[title="Export CSV"]').click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('variables, covariates and filters are added to and removed from the pool', async ({ page }) => {
    await openNewStudio(page);
    for (const label of ['Exact age', 'MMSE Total scores', 'Gender']) await addVariable(page, label);
    const pool = page.locator('.pool-chip');
    await expect(pool).toHaveCount(3);
    await shot(page, 'vp-08-pool-three-variables');

    // The CTA moves on to data handling once variables are chosen.
    await expect(page.locator('.sub-header-cta')).toHaveText(/Continue with/);

    // Clicking a chip focuses that variable in the details panel.
    await pool.filter({ hasText: 'MMSE Total scores' }).click();
    await expect(page.locator('#histogram-graph')).toContainText('MMSE Total scores');

    // Remove one again via the details card toggle.
    await page.locator('[data-guide="guide-add-variable"]').click();
    await expect(pool).toHaveCount(2);
  });
});
