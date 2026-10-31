import { Locator, Page } from '@playwright/test';
import { addVariable, assignRole, chooseAlgorithm, expect, goToAlgorithms, goToDataHandling, openNewStudio, runExperiment, shot, test } from './live';

/** Data Handling pipeline (source data, cohort filter, preprocessing, transformations) against real Exaflow previews. */

async function openPipeline(page: Page, variables = ['Exact age', 'MMSE Total scores', 'Gender']) {
  await openNewStudio(page);
  for (const label of variables) await addVariable(page, label);
  await goToDataHandling(page);
}

async function addCondition(scope: Locator, variable: string) {
  await scope.getByRole('button', { name: 'Add condition' }).or(scope.getByRole('button', { name: 'Condition', exact: true })).click();
  const fields = scope.locator('.condition-fields').last();
  await fields.getByPlaceholder('Type to find a variable').fill(variable);
  return fields;
}

/** The transformation step offers its column types right away once it holds a column. */
async function chooseColumnType(page: Page, type: RegExp) {
  const option = page.getByRole('button', { name: type });
  if (!(await option.isVisible())) {
    const add = page.getByTitle('Add and open a derived column').or(page.getByRole('button', { name: /Add derived column/ }));
    await add.first().click();
  }
  await option.click();
}

function terminal(page: Page) {
  return page.locator('.pipeline-terminal-card');
}

test.describe('data handling (live)', () => {
  test('raw data preview shows Exaflow describe statistics per dataset', async ({ page }) => {
    await openPipeline(page);
    await shot(page, 'dh-01-pipeline');
    await page.locator('[data-guide="analysis-source-data"] .pipeline-node-toggle').click();
    const raw = page.locator('section.pipeline-node').first();
    await expect(raw.getByRole('row').first()).toContainText(/All datasets/);
    await expect(raw.getByRole('row', { name: /^Datapoints/ }).first()).toBeVisible();
    await expect(raw.getByRole('row', { name: /^Mean/ }).first()).toContainText(/\d/);
    await shot(page, 'dh-02-raw-describe');
  });

  test('cohort filter narrows the records the next run uses', async ({ page }) => {
    await openPipeline(page);
    const before = await terminal(page).innerText();
    await page.getByTitle('Open the rule builder').click();
    const modal = page.locator('app-filter-config-modal:visible');
    const age = await addCondition(modal, 'Exact age');
    const operator = age.locator('select.filter-field-input').first();
    await expect(operator).toContainText('is at least');
    await operator.selectOption({ label: 'is at least' });
    await age.getByPlaceholder('Value').fill('70');
    const gender = await addCondition(modal, 'Gender');
    await gender.locator('select.filter-field-input').last().selectOption({ label: 'Female' });
    await shot(page, 'dh-03-filter-builder');
    await page.locator('.filter-workflow-section').getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.locator('[data-guide="analysis-cohort-filter"], .filter-workflow-section').first()).toContainText(/Exact age/);
    await expect(terminal(page)).not.toHaveText(before);
    await expect(terminal(page)).toContainText(/[\d,]+ of [\d,]+ records/);
    await shot(page, 'dh-04-filter-applied');
  });

  test('preprocessing: mean imputation and outlier capping are applied', async ({ page }) => {
    await openPipeline(page);
    await page.getByRole('button', { name: 'Customize rules' }).click();
    const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
    await missing.getByRole('button', { name: 'Set all' }).click();
    await page.getByRole('menuitem', { name: 'Set all numerical to Mean imputation' }).click();
    await shot(page, 'dh-05-missing-values-mean');
    await missing.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(missing).toContainText(/Mean imputation|Applied/);

    await page.locator('button:visible').filter({ hasText: /Add outlier/ }).first().click();
    const outlier = page.locator('app-station-card', { hasText: 'Outlier Handling' });
    await outlier.getByRole('button', { name: 'Batch' }).click();
    await page.getByRole('menuitem', { name: 'Enable for all numerical' }).click();
    await shot(page, 'dh-06-outliers-enabled');
    await outlier.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(outlier).toContainText('Applied');
    await expect(terminal(page)).toContainText('Preprocessing: 2 steps');
    await expect(terminal(page)).toContainText(/[\d,]+ of [\d,]+ records/);
    await shot(page, 'dh-07-preprocessing-applied');
  });

  test('transformations: nominal rule column, PCA columns and K-means on them', async ({ page }) => {
    await openPipeline(page);
    // Nominal column from rules.
    await chooseColumnType(page, /Nominal column from rules/);
    await page.getByPlaceholder('e.g. mrs_good_outcome').fill('is_female');
    await page.getByRole('button', { name: /Add the first category/ }).click();
    await page.getByPlaceholder('Enumeration value').fill('female');
    const editor = page.locator('.transformation-rule-editor.is-open');
    const fields = editor.locator('.condition-fields').first();
    await fields.getByPlaceholder('Type to find a variable').fill('Gender');
    await fields.locator('select.filter-field-input').last().selectOption({ label: 'Female' });
    await editor.getByRole('button', { name: 'Done' }).click();
    await page.getByPlaceholder('unknown').fill('other');
    await expect(page.getByText('Gender is Female')).toBeVisible();
    await shot(page, 'dh-08-nominal-column');

    // PCA component columns fitted by Exaflow on the numerical variables.
    await chooseColumnType(page, /PCA component columns/);
    const pca = page.locator('app-pca-column-source');
    await pca.getByRole('button', { name: 'Fit on selected variables' }).click();
    await pca.getByRole('button', { name: 'Add component columns' }).click();
    await expect(pca.getByText('pca_pc1, pca_pc2')).toBeVisible();
    await shot(page, 'dh-09-pca-columns');

    // K-means report on the PCA outputs.
    await chooseColumnType(page, /K-means cluster column/);
    const kmeans = page.locator('app-kmeans-cluster-source').last();
    await kmeans.getByRole('button', { name: 'Fit on selected variables' }).click();
    // The variable chips can re-render while the PCA outputs land (the same race makes the
    // mocked "PCA columns then K-means" flow flaky on master), so retry until the pick sticks.
    const chips = kmeans.locator('.kmeans-cluster-source-var');
    await expect(async () => {
      for (const chip of await chips.all()) {
        const label = (await chip.innerText()).replace(/\s+/g, ' ');
        const wanted = /pca_pc1|pca_pc2/.test(label);
        if (((await chip.getAttribute('aria-pressed')) === 'true') !== wanted) await chip.click();
      }
      await page.waitForTimeout(300);
      const pressed = await chips.evaluateAll((els) => els.filter((el) => el.getAttribute('aria-pressed') === 'true').map((el) => el.textContent?.trim()));
      expect(pressed.join(' | ')).toMatch(/^pca_pc1 \| pca_pc2$|pca_pc1.*pca_pc2/);
      expect(pressed).toHaveLength(2);
    }).toPass({ timeout: 30_000 });
    await kmeans.locator('#kmeans-fit-k').fill('3');
    await kmeans.getByRole('button', { name: 'Add cluster column' }).click();
    const card = page.locator('app-station-card', { hasText: 'K-means cluster column · kmeans_cluster' });
    await expect(card).toContainText('Applied');
    await shot(page, 'dh-10-kmeans-on-pca');
    await card.getByRole('button', { name: 'Back to column' }).click();
    await expect(kmeans.getByText('Column kmeans_cluster')).toBeVisible();
    await shot(page, 'dh-11-transformations-summary');

    // The derived columns reach the algorithm step and a real federated run.
    await goToAlgorithms(page);
    for (const column of ['is_female', 'pca_pc1', 'pca_pc2', 'kmeans_cluster']) {
      await expect(page.locator('app-algorithm-role-assignment li.row', { hasText: column })).toBeVisible();
    }
    await assignRole(page, 'Gender', 'Outcome');
    await assignRole(page, 'pca_pc1', 'Predictor');
    await assignRole(page, 'kmeans_cluster', 'Predictor');
    await chooseAlgorithm(page, 'Logistic Regression');
    // The run stays blocked until the required positive class is chosen.
    await expect(page.locator('.sub-header-cta', { hasText: 'Run experiment' })).toBeDisabled();
    await expect(page.getByText('Not ready to run yet')).toBeVisible();
    await shot(page, 'dh-12-logistic-needs-positive-class');
    const positiveClass = page.locator('.config-field', { hasText: 'Positive class' }).locator('select');
    await positiveClass.selectOption({ index: 1 });
    const runRequest = page.waitForRequest((r) => r.url().endsWith('/services/experiments/runs') && r.method() === 'POST');
    await runExperiment(page);
    const body = (await runRequest).postDataJSON();
    const steps: string[] = (body.analysis.preprocessing ?? []).map((step: { name: string }) => step.name);
    expect(steps.indexOf('pca_column_creator')).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf('kmeans_cluster_creator')).toBeGreaterThan(steps.indexOf('pca_column_creator'));
    expect(steps).toContain('categorical_column_creator');
    await expect(page.getByText('The experiment did not finish')).toHaveCount(0);
    const result = page.locator('app-execution-panel');
    await expect(result).toContainText(/LOGISTIC REGRESSION/i);
    await expect(result).toContainText(/pca_pc1/);
    await shot(page, 'dh-13-logistic-result');
  });
});
