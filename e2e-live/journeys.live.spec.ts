import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  addVariable, assignRole, chooseAlgorithm, excludeUnloadedDatasets, expect, goToAlgorithms, goToDataHandling,
  runExperiment, searchVariable, shot, test,
} from './live';

/**
 * End-to-end user journeys through the whole studio on the running platform:
 * Data Exploration (variables panel) → Data Handling → Algorithm (selection + run) → Execution Results.
 * No request is mocked; histograms, describe, PCA, K-means and the runs come from Exaflow.
 */

const runCta = (page: Page) => page.locator('.sub-header-cta', { hasText: 'Run experiment' });
const terminal = (page: Page) => page.locator('.pipeline-terminal-card');
const result = (page: Page) => page.locator('app-execution-panel');
const histogram = (page: Page) => page.locator('#histogram-tab-panel');
const stepper = (page: Page) => page.getByRole('navigation', { name: 'Experiment Studio wizard' });

async function startNewExperiment(page: Page) {
  await page.goto('/experiments-dashboard');
  await page.getByRole('button', { name: 'New experiment' }).click();
  await expect(page).toHaveURL(/\/experiment-studio\/?$/);
  await expect(page.locator('.study-context-chip')).toContainText('Dementia');
}

/** Study context: the demo data models are offered and the `*_test` datasets no worker holds are left out. */
async function pickDataModelAndDatasets(page: Page) {
  const chip = page.locator('.study-context-chip');
  await chip.click();
  for (const model of ['Dementia', 'Dementia longitudinal', 'Traumatic Brain Injury']) {
    await expect(page.locator('.data-model-chip', { hasText: new RegExp(`^\\s*${model}`) }).first()).toBeVisible();
  }
  await expect(page.locator('.dataset-counter-badge')).toHaveText('33/33');
  await excludeUnloadedDatasets(page); // works on the open panel and closes it
  await expect(chip).toContainText('30 datasets');
}

async function addCondition(page: Page, variable: string) {
  const modal = page.locator('app-filter-config-modal:visible');
  await modal.getByRole('button', { name: 'Add condition' }).or(modal.getByRole('button', { name: 'Condition', exact: true })).click();
  const fields = modal.locator('.condition-fields').last();
  await fields.getByPlaceholder('Type to find a variable').fill(variable);
  return fields;
}

/** The transformation step offers its column types right away once it holds a column. */
async function chooseColumnType(page: Page, type: RegExp) {
  const option = page.getByRole('button', { name: type });
  if (!(await option.isVisible())) {
    await page.getByTitle('Add and open a derived column').or(page.getByRole('button', { name: /Add derived column/ })).first().click();
  }
  await option.click();
}

test.describe('studio journeys (live)', () => {
  test('journey 1: explore → filter, preprocess, PCA and K-means → catalog → logistic regression result', async ({ page }) => {
    // Data Exploration: context, browser views, search, details and histogram.
    await startNewExperiment(page);
    await pickDataModelAndDatasets(page);
    await shot(page, 'j1-01-study-context');
    const views = page.getByRole('group', { name: 'Metadata browser view' });
    for (const view of ['List', 'Graph', 'Map']) {
      await views.getByRole('button', { name: view }).click();
      await expect(views.getByRole('button', { name: view })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#data-model-visualization')).toContainText('Demographics');
    }
    await searchVariable(page, 'Exact age');
    await expect(page.locator('#histogram-graph')).toContainText('Exact age');
    await expect(histogram(page)).toContainText(/count/i);
    await expect(histogram(page)).toContainText(/hidden \(too few records per bin for privacy\)/);
    const split = page.locator('#histogram-split-select');
    await expect(split.locator('option', { hasText: 'Dataset' })).toBeDisabled();
    await expect(split.locator('option', { hasText: 'Dataset' })).toHaveAttribute('title', /Too many datasets \(30\)/);
    await page.getByRole('tab', { name: /Details/ }).click();
    await expect(page.locator('#metadata-tab-panel')).toContainText(/real/i);
    await page.getByRole('tab', { name: /Chart/ }).click();
    await shot(page, 'j1-02-exact-age-histogram');

    // Variables (outcome candidates and covariates); the nominal one becomes a histogram split.
    for (const label of ['Exact age', 'MMSE Total scores', 'Gender']) await addVariable(page, label);
    await expect(page.locator('.pool-chip')).toHaveCount(3);
    await page.locator('.pool-chip', { hasText: 'Exact age' }).click();
    await split.selectOption({ label: 'Gender' });
    await expect(histogram(page)).toContainText('Female');
    await shot(page, 'j1-03-split-by-gender');

    // Data Handling: describe preview, cohort filter, preprocessing.
    await goToDataHandling(page);
    await page.locator('[data-guide="analysis-source-data"] .pipeline-node-toggle').click();
    const raw = page.locator('section.pipeline-node').first();
    await expect(raw.getByRole('row').first()).toContainText(/All datasets/);
    await expect(raw.getByRole('row', { name: /^Mean/ }).first()).toContainText(/\d/);
    await shot(page, 'j1-04-raw-describe');
    await page.locator('[data-guide="analysis-source-data"] .pipeline-node-toggle').click();

    await page.getByTitle('Open the rule builder').click();
    const age = await addCondition(page, 'Exact age');
    await age.locator('select.filter-field-input').first().selectOption({ label: 'is at least' });
    await age.getByPlaceholder('Value').fill('60');
    await page.locator('.filter-workflow-section').getByRole('button', { name: 'Apply filters' }).click();
    await expect(terminal(page)).toContainText(/[\d,]+ of [\d,]+ records/);
    await shot(page, 'j1-05-filter-applied');

    await page.getByRole('button', { name: 'Customize rules' }).click();
    const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
    await missing.getByRole('button', { name: 'Set all' }).click();
    await page.getByRole('menuitem', { name: 'Set all numerical to Mean imputation' }).click();
    await missing.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(missing).toContainText(/Mean imputation|Applied/);
    await page.locator('button:visible').filter({ hasText: /Add outlier/ }).first().click();
    const outlier = page.locator('app-station-card', { hasText: 'Outlier Handling' });
    await outlier.getByRole('button', { name: 'Batch' }).click();
    await page.getByRole('menuitem', { name: 'Enable for all numerical' }).click();
    await outlier.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(outlier).toContainText('Applied');
    await expect(terminal(page)).toContainText('Preprocessing: 2 steps');
    await shot(page, 'j1-06-preprocessing-applied');

    // Data Handling: transformations (a nominal rule column, PCA columns, then K-means on the PCA outputs).
    await chooseColumnType(page, /Nominal column from rules/);
    await page.getByPlaceholder('e.g. mrs_good_outcome').fill('is_female');
    await page.getByRole('button', { name: /Add the first category/ }).click();
    await page.getByPlaceholder('Enumeration value').fill('female');
    const editor = page.locator('.transformation-rule-editor.is-open');
    const ruleFields = editor.locator('.condition-fields').first();
    await ruleFields.getByPlaceholder('Type to find a variable').fill('Gender');
    await ruleFields.locator('select.filter-field-input').last().selectOption({ label: 'Female' });
    await editor.getByRole('button', { name: 'Done' }).click();
    await page.getByPlaceholder('unknown').fill('other');
    await expect(page.getByText('Gender is Female')).toBeVisible();
    await chooseColumnType(page, /PCA component columns/);
    const pca = page.locator('app-pca-column-source');
    await pca.getByRole('button', { name: 'Fit on selected variables' }).click();
    await pca.getByRole('button', { name: 'Add component columns' }).click();
    await expect(pca.getByText('pca_pc1, pca_pc2')).toBeVisible();
    await chooseColumnType(page, /K-means cluster column/);
    const kmeans = page.locator('app-kmeans-cluster-source').last();
    await kmeans.getByRole('button', { name: 'Fit on selected variables' }).click();
    // The chips can re-render while the PCA outputs land (the same race makes the mocked
    // "PCA columns then K-means" flow flaky on master), so retry until the pick sticks.
    const chips = kmeans.locator('.kmeans-cluster-source-var');
    await expect(async () => {
      for (const chip of await chips.all()) {
        const wanted = /pca_pc1|pca_pc2/.test(await chip.innerText());
        if (((await chip.getAttribute('aria-pressed')) === 'true') !== wanted) await chip.click();
      }
      await page.waitForTimeout(300);
      const pressed = await chips.evaluateAll((els) => els.filter((el) => el.getAttribute('aria-pressed') === 'true').map((el) => el.textContent ?? ''));
      expect(pressed).toHaveLength(2);
      expect(pressed.join(' ')).toMatch(/pca_pc1.*pca_pc2/s);
    }).toPass({ timeout: 30_000 });
    await kmeans.locator('#kmeans-fit-k').fill('3');
    await kmeans.getByRole('button', { name: 'Add cluster column' }).click();
    const kmeansCard = page.locator('app-station-card', { hasText: 'K-means cluster column · kmeans_cluster' });
    await expect(kmeansCard).toContainText('Applied');
    await kmeansCard.getByRole('button', { name: 'Back to column' }).click();
    await expect(kmeans.getByText('Column kmeans_cluster')).toBeVisible();
    await shot(page, 'j1-07-pca-then-kmeans');

    // Algorithm: roles, catalog (runnable/all, blocked reasons, groups, search), parameters.
    await goToAlgorithms(page);
    for (const column of ['is_female', 'pca_pc1', 'pca_pc2', 'kmeans_cluster']) {
      await expect(page.locator('app-algorithm-role-assignment li.row', { hasText: column })).toBeVisible();
    }
    await expect(runCta(page)).toBeDisabled();
    await assignRole(page, 'Gender', 'Outcome');
    await assignRole(page, 'pca_pc1', 'Predictor');
    await assignRole(page, 'kmeans_cluster', 'Predictor');
    await page.getByRole('button', { name: /^All\b/ }).click();
    const clustering = page.locator('.algorithm-match-cat', { hasText: 'Clustering' });
    await clustering.click();
    await expect(page.locator('.algo-tile', { hasText: 'K-means' }).first()).toBeVisible();
    await clustering.click();
    await page.locator('#algo-search').fill('Linear Regression');
    const blocked = page.locator('.algo-tile.disabled-algo', { hasText: 'Linear Regression' }).first();
    await expect(blocked.locator('.algo-why')).not.toHaveText('');
    await shot(page, 'j1-08-catalog-blocked-reason');
    await page.locator('#algo-search').fill('zzz-no-such-method');
    await expect(page.locator('.algo-tile')).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear algorithm search' }).click();
    await expect(page.locator('.algo-tile').first()).toBeVisible();
    await chooseAlgorithm(page, 'Logistic Regression');
    await expect(page.locator('.inspector-tag')).toHaveText('Regression');
    await expect(runCta(page)).toBeDisabled();
    await expect(page.getByText('Not ready to run yet')).toBeVisible();
    await shot(page, 'j1-09-needs-positive-class');
    await page.locator('.config-field', { hasText: 'Positive class' }).locator('select').selectOption({ index: 1 });

    // Run and result: the request carries the ordered pipeline; the result renders.
    const runRequest = page.waitForRequest((r) => r.url().endsWith('/services/experiments/runs') && r.method() === 'POST');
    await runExperiment(page);
    const analysis = (await runRequest).postDataJSON().analysis;
    const steps: string[] = (analysis.preprocessing ?? []).map((step: { name: string }) => step.name);
    expect(steps.indexOf('pca_column_creator')).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf('kmeans_cluster_creator')).toBeGreaterThan(steps.indexOf('pca_column_creator'));
    expect(steps).toContain('categorical_column_creator');
    expect(analysis.inputdata.datasets).toHaveLength(30);
    expect(analysis.inputdata.filters).toBeTruthy();
    await expect(result(page)).toContainText(/LOGISTIC REGRESSION/i);
    await expect(result(page)).toContainText('pca_pc1');
    await expect(result(page)).toContainText('Dementia · 30 datasets');
    await expect(page.getByText('The experiment did not finish')).toHaveCount(0);
    await shot(page, 'j1-10-logistic-result');
  });

  test('journey 2: explore → default handling → linear regression with CV checks → result → ZIP and PDF export', async ({ page }) => {
    await startNewExperiment(page);
    await pickDataModelAndDatasets(page);
    for (const label of ['Exact age', 'MMSE Total scores', 'Gender']) await addVariable(page, label);

    // A nominal histogram exports as CSV from the details card.
    await page.locator('.pool-chip', { hasText: 'Gender' }).click();
    await expect(histogram(page)).toContainText('Male');
    await page.locator('#histogram-graph button[title="Export histogram"]').click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('button[title="Export CSV"]').click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);

    await goToDataHandling(page);
    await expect(terminal(page)).toContainText('Missing values: remove rows (default)');
    await goToAlgorithms(page);
    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await assignRole(page, 'Gender', 'Predictor');
    await expect(page.getByRole('button', { name: /^Runnable\b/ })).toHaveText(/Runnable\s*3/);
    await chooseAlgorithm(page, 'Linear Regression');
    await expect(page.locator('app-algorithm-panel')).toContainText('Needs a numerical outcome');
    await page.locator('details.documentation-panel summary').click();
    await expect(page.locator('details.documentation-panel')).toHaveAttribute('open', '');

    // Cross-validation folds are validated, then switched off again for the plain model.
    const cv = page.locator('.toggle-switch input');
    await cv.check({ force: true });
    const folds = page.locator('.config-option-detail input');
    await folds.fill('1');
    await folds.blur();
    await expect(runCta(page)).toBeDisabled();
    await shot(page, 'j2-01-cv-folds-invalid');
    await folds.fill('3');
    await folds.blur();
    await expect(runCta(page)).toBeEnabled();
    await cv.uncheck({ force: true });
    await expect(page.getByText(/Ready · Linear Regression/)).toBeVisible();

    await runExperiment(page);
    await expect(result(page)).toContainText('subjectage ~ gender[M] + minimentalstate');
    await expect(result(page)).toContainText('R²');
    await expect(result(page)).toContainText(/F\(2, \d+\) = [\d.]+/);
    await expect(result(page).getByRole('row', { name: /MMSE Total scores/ })).toContainText(/\d/);
    await expect(result(page).getByRole('row', { name: /Intercept/ })).toContainText(/\d/);
    await shot(page, 'j2-02-linear-result');

    await page.locator('[data-guide="result-export"]').click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /ZIP/ }).click()]);
    expect(zip.suggestedFilename()).toMatch(/\.zip$/);
    const archive = await JSZip.loadAsync(readFileSync(await zip.path()));
    expect(Object.keys(archive.files).some((name) => name.endsWith('.csv'))).toBe(true);
    await page.locator('[data-guide="result-export"]').click();
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('menuitem', { name: /PDF/ }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = readFileSync(await pdf.path());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);

    // Back to the algorithm step with the selection kept.
    await page.getByRole('button', { name: 'Edit parameters' }).click();
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear Regression');
  });

  test('journey 3: unavailable datasets surface the Exaflow error at every layer', async ({ page }) => {
    // Keeping the *_test datasets selected makes Exaflow reject every request for real.
    await startNewExperiment(page);
    await expect(page.locator('.study-context-chip')).toContainText('33 datasets');
    await searchVariable(page, 'Exact age');
    await expect(histogram(page)).toContainText('No distribution for this selection.');
    await addVariable(page, 'Exact age');
    await addVariable(page, 'MMSE Total scores');
    await goToDataHandling(page);
    await goToAlgorithms(page);
    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await chooseAlgorithm(page, 'Linear Regression');
    await runExperiment(page);
    await expect(page.getByText('The experiment did not finish')).toBeVisible();
    await expect(page.getByText(/could not be found for data_model/)).toBeVisible();
    await shot(page, 'j3-01-engine-error');
  });

  test('journey 4: changing variables after Data Handling updates the algorithm step', async ({ page }) => {
    await startNewExperiment(page);
    await pickDataModelAndDatasets(page);
    for (const label of ['Exact age', 'Gender']) await addVariable(page, label);
    await goToDataHandling(page);
    await expect(terminal(page)).toContainText('2 variables');
    await goToAlgorithms(page);
    await assignRole(page, 'Exact age', 'Outcome');
    await assignRole(page, 'Gender', 'Predictor');
    await chooseAlgorithm(page, 'Linear Regression');
    await expect(runCta(page)).toBeEnabled();
    await shot(page, 'j4-01-linear-ready');

    // Back in Data Exploration: drop Gender, add MMSE.
    await stepper(page).getByRole('button', { name: /Data Exploration/ }).click();
    await page.locator('.pool-chip', { hasText: 'Gender' }).click();
    await page.locator('[data-guide="guide-add-variable"]').click();
    await expect(page.locator('.pool-chip', { hasText: 'Gender' })).toHaveCount(0);
    await addVariable(page, 'MMSE Total scores');

    // Data Handling follows the new variable set.
    await stepper(page).getByRole('button', { name: /Data Handling/ }).click();
    await expect(terminal(page)).toContainText('2 variables');
    await expect(page.locator('[data-guide="analysis-preprocessing"]')).toContainText(/MMSE|2 variables/);

    // The algorithm step drops the removed predictor and offers the new variable.
    await stepper(page).getByRole('button', { name: /Algorithm Selection/ }).click();
    await expect(page.getByRole('button', { name: 'Remove Gender from predictors' })).toHaveCount(0);
    await expect(page.locator('app-algorithm-role-assignment li.row', { hasText: 'MMSE Total scores' })).toBeVisible();
    await shot(page, 'j4-02-after-variable-change');
    await assignRole(page, 'MMSE Total scores', 'Predictor');
    await chooseAlgorithm(page, 'Linear Regression');
    await runExperiment(page);
    await expect(result(page)).toContainText('subjectage ~ minimentalstate');
    await shot(page, 'j4-03-linear-on-new-variables');
  });
});
