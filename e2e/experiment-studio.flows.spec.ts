import { Page } from '@playwright/test';
import { seedLinearExperiment, StudioApi } from './experiment-studio-api';
import { expect, lastRequest, test } from './fixtures';
import {
  addKMeansColumn,
  addNominalColumn,
  addVariable,
  alphaInput,
  applyFilters,
  applyLongitudinalStrategy,
  applyMeanImputationToAll,
  applyOutlierChoice,
  assignRole,
  clearRole,
  collapsePreprocessing,
  expectAlgorithm,
  expectAlgorithmBlocked,
  goToAlgorithms,
  goToDataHandling,
  openAgeAndSex,
  openLongitudinalAge,
  openMissingValues,
  openNewStudio,
  prepareLinearRun,
  runExperiment,
  saveExperiment,
  setAlpha,
} from './studio';

/**
 * End-to-end experiment studio flows against a mocked `/services` API.
 * Each test is named for the flow it covers so a failure says which one broke.
 * Payload checks read the request the studio sent, since that is what Exaflow runs.
 */

const TRANSIENT = '/services/experiments/transient';

/** One preprocessing step from the latest Data review preview (`describe`). */
function previewStep(api: StudioApi, name: string) {
  const steps: { name: string; parameters: Record<string, any> }[] =
    lastRequest(api, 'POST', TRANSIENT, 'describe').analysis.preprocessing ?? [];
  const step = steps.find((candidate) => candidate.name === name);
  expect(step, `preview sends ${name}`).toBeTruthy();
  return step!.parameters;
}

test.describe('experiment studio', () => {
  test('new experiment starts empty and lists the variables it adds', async ({ page }) => {
    await openNewStudio(page);
    await expect(page).not.toHaveURL(/experimentId/);
    await addVariable(page, 'Age');
    await expect(page.locator('.pool-card')).toContainText('Age');
    await expect(page.locator('.sub-header-cta')).toHaveText(/Continue with 1 variable/);
  });

  test('open a saved experiment from the dashboard', async ({ page, api }) => {
    api.experiments.push(seedLinearExperiment());
    await page.goto('/experiments-dashboard');
    await page.getByRole('option', { name: /Baseline age model/ }).click();
    await expect(page.getByRole('heading', { name: 'Baseline age model' })).toBeVisible();
    await page.getByRole('button', { name: /Open in Studio/ }).click();
    await expect(page).toHaveURL(/mode=edit/);
    await expect(page).toHaveURL(/experimentId=exp-seed-1/);
    await expect(page.locator('.pool-chip', { hasText: 'Age' })).toBeVisible();
    await expect(page.locator('.pool-chip', { hasText: 'Sex' })).toBeVisible();
    await goToDataHandling(page);
    await goToAlgorithms(page);
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
    await expect(page.getByRole('button', { name: 'Remove Age from outcome' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Sex from predictors' })).toBeVisible();
  });

  test('edit a saved experiment and save the changed parameter', async ({ page, api }) => {
    api.experiments.push(seedLinearExperiment());
    await page.goto('/experiment-studio?experimentId=exp-seed-1&mode=edit');
    await expect(page.locator('.pool-chip', { hasText: 'Age' })).toBeVisible();
    await goToDataHandling(page);
    await goToAlgorithms(page);
    await expect(alphaInput(page)).toHaveValue('0.05');
    await setAlpha(page, '0.2');
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
    await saveExperiment(page, 'Edited age model');
    await expect(page.getByText('Experiment saved successfully!')).toBeVisible();

    const body = lastRequest(api, 'POST', '/services/experiments');
    expect(body.name).toBe('Edited age model');
    expect(body.analysis.algorithm).toMatchObject({ name: 'linear_regression', y: ['age'], x: ['sex'], parameters: { alpha: 0.2 } });
    // The saved preprocessing comes back unchanged.
    expect(body.analysis.preprocessing).toContainEqual({
      name: 'missing_values_handler',
      parameters: { strategies: { age: 'drop', sex: 'drop' } },
    });
  });

  test('edit when specifications answer after the experiment', async ({ page, api }) => {
    api.experiments.push(seedLinearExperiment());
    // A slow Exaflow catalog: the saved experiment arrives first, the specifications 2 s later.
    await page.route('**/services/specifications/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.fallback();
    });

    await page.goto('/experiment-studio?experimentId=exp-seed-1&mode=edit');
    await expect(page.locator('.pool-chip', { hasText: 'Age' })).toBeVisible();
    await goToDataHandling(page);
    await goToAlgorithms(page);
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
    await expect(alphaInput(page)).toHaveValue('0.05');
    await expect(page.getByRole('button', { name: 'Remove Age from outcome' })).toBeVisible();
  });

  test('save sends the whole analysis', async ({ page, api }) => {
    await prepareLinearRun(page);
    await setAlpha(page, '0.2');
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
    await saveExperiment(page, 'Age by sex');
    await expect(page.getByText('Experiment saved successfully!')).toBeVisible();
    await expect(page.getByText('Saved as “Age by sex”')).toBeVisible();

    const body = lastRequest(api, 'POST', '/services/experiments');
    expect(body.name).toBe('Age by sex');
    expect(body.analysis.algorithm).toMatchObject({ name: 'linear_regression', y: ['age'], x: ['sex'], parameters: { alpha: 0.2 } });
    expect(body.analysis.inputdata).toMatchObject({ data_model: 'dementia:1', datasets: ['chuv', 'adni'], filters: null });
    expect(body.analysis.inputdata.variables).toEqual(expect.arrayContaining(['age', 'sex']));
    expect(body.analysis.preprocessing).toContainEqual({
      name: 'missing_values_handler',
      parameters: { strategies: { age: 'drop', sex: 'drop' } },
    });
  });

  test('re-open restores preprocessing and parameters', async ({ page }) => {
    await prepareLinearRun(page);
    await page.getByRole('button', { name: 'Back to Data Handling' }).click();
    await expect(page.getByRole('heading', { name: 'Data Handling Pipeline' })).toBeVisible();
    await applyMeanImputationToAll(page);
    await page.getByRole('button', { name: 'Continue to Algorithm Selection' }).last().click();
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
    await setAlpha(page, '0.2');
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
    await saveExperiment(page, 'Reopened age model');
    await expect(page.getByText('Experiment saved successfully!')).toBeVisible();

    await page.getByRole('link', { name: 'My experiments' }).click();
    await expect(page).toHaveURL(/experiments-dashboard/);
    await page.getByRole('option', { name: /Reopened age model/ }).click();
    await page.getByRole('button', { name: /Open in Studio/ }).click();
    await expect(page).toHaveURL(/mode=edit/);
    await expect(page.locator('.pool-chip', { hasText: 'Age' })).toBeVisible();
    await goToDataHandling(page);
    await expect(page.getByText(/Mean imputation|Imputation configured/).first()).toBeVisible();
    await goToAlgorithms(page);
    await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
    await expect(alphaInput(page)).toHaveValue('0.2');
  });

  test('algorithms follow the assigned roles', async ({ page }) => {
    await openNewStudio(page);
    await addVariable(page, 'Age');
    await addVariable(page, 'Sex');
    await addVariable(page, 'APOE');
    await goToDataHandling(page);
    await goToAlgorithms(page);

    await assignRole(page, 'Age', 'Outcome');
    await assignRole(page, 'Sex', 'Predictor');
    await expectAlgorithm(page, 'Linear regression', 'Regression');
    await expectAlgorithm(page, 'Independent t-test', 'Statistical Tests');
    await expectAlgorithm(page, 'One-way ANOVA', 'Statistical Tests');
    await expectAlgorithm(page, 'Pearson correlation', 'Correlation');
    await expectAlgorithmBlocked(page, 'K-means');
    await expectAlgorithmBlocked(page, 'PCA');
    await expectAlgorithmBlocked(page, 'Logistic regression');

    await clearRole(page, 'Sex', 'predictors');
    await expectAlgorithm(page, 'K-means', 'Clustering');
    await expectAlgorithm(page, 'PCA', 'Dimensionality Reduction');

    await clearRole(page, 'Age', 'outcome');
    await assignRole(page, 'Sex', 'Outcome');
    await assignRole(page, 'Age', 'Predictor');
    await expectAlgorithm(page, 'Logistic regression', 'Regression');
    await expectAlgorithm(page, 'Naive Bayes gaussian', 'Classification');

    await clearRole(page, 'Age', 'predictors');
    await assignRole(page, 'APOE', 'Predictor');
    await expectAlgorithm(page, 'Chi-squared', 'Statistical Tests');
    await expectAlgorithm(page, 'Naive Bayes categorical', 'Classification');
  });
});

test.describe('preprocessing', () => {
  const missingStrategies = [
    { radio: /Mean imputation/, label: 'Mean imputation', strategy: 'mean' },
    { radio: /Median imputation/, label: 'Median imputation', strategy: 'median' },
    { radio: /Constant value/, label: 'Constant value', strategy: 'constant', value: '70' },
  ];
  for (const { radio, label, strategy, value } of missingStrategies) {
    test(`missing values: ${label}`, async ({ page, api }) => {
      await openAgeAndSex(page);
      const missing = await openMissingValues(page);
      await missing.getByRole('radio', { name: radio }).click();
      if (value) await missing.getByPlaceholder('Value').fill(value);
      await missing.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePreprocessing(page);
      await expect(page.getByText(`Age: ${label}`)).toBeVisible();

      const parameters = previewStep(api, 'missing_values_handler');
      expect(parameters.strategies).toEqual({ age: strategy, sex: 'drop' });
      if (value) expect(JSON.stringify(parameters)).toContain(value);
    });
  }

  test('missing values: switch a strategy back to removing rows', async ({ page, api }) => {
    await openAgeAndSex(page);
    const missing = await openMissingValues(page);
    await missing.getByRole('radio', { name: /Mean imputation/ }).click();
    await missing.getByRole('button', { name: 'Apply', exact: true }).click();
    await collapsePreprocessing(page);
    await expect(page.getByText('Age: Mean imputation')).toBeVisible();
    await page.getByRole('button', { name: /Missing Values Strategy/ }).click();
    const reopened = page.locator('app-station-card', { hasText: 'Missing Values' });
    await reopened.getByRole('radio', { name: /Remove rows/ }).click();
    await reopened.getByRole('button', { name: 'Apply', exact: true }).click();
    await collapsePreprocessing(page);
    await expect(page.getByText(/Rows with missing values removed/)).toBeVisible();
    expect(previewStep(api, 'missing_values_handler').strategies).toEqual({ age: 'drop', sex: 'drop' });
  });

  test('batch actions set every numerical variable', async ({ page, api }) => {
    await openAgeAndSex(page);
    await applyMeanImputationToAll(page);
    await page.locator('button:visible').filter({ hasText: /Add outlier/ }).first().click();
    const outlier = page.locator('app-station-card', { hasText: 'Outlier Handling' });
    await outlier.getByRole('button', { name: 'Batch' }).click();
    await page.getByRole('menuitem', { name: 'Enable for all numerical' }).click();
    await outlier.getByRole('button', { name: 'Apply', exact: true }).click();
    await collapsePreprocessing(page);
    await expect(page.getByText(/Extreme values capped/).first()).toBeVisible();

    expect(previewStep(api, 'missing_values_handler').strategies).toEqual({ age: 'mean', sex: 'drop' });
    expect(Object.keys(previewStep(api, 'outlier_winsorizer').strategies)).toEqual(['age']);
  });

  const outlierMethods = [
    { method: 'Gaussian', strategy: 'gaussian' },
    { method: 'IQR', strategy: 'iqr' },
    { method: 'MAD', strategy: 'mad' },
    { method: 'Quantile', strategy: 'quantile' },
  ];
  for (const { method, strategy } of outlierMethods) {
    test(`outliers: ${method} method`, async ({ page, api }) => {
      await openAgeAndSex(page);
      await applyOutlierChoice(page, method);
      await expect(page.getByText(`(${method})`)).toBeVisible();
      expect(previewStep(api, 'outlier_winsorizer').strategies).toEqual({ age: strategy });
    });
  }

  const outlierTails = [
    { clip: 'Low only', tail: 'left' },
    { clip: 'High only', tail: 'right' },
    { clip: 'Both', tail: 'both' },
  ];
  for (const { clip, tail } of outlierTails) {
    test(`outliers: clip ${clip.toLowerCase()}`, async ({ page, api }) => {
      await openAgeAndSex(page);
      await applyOutlierChoice(page, undefined, clip);
      expect(previewStep(api, 'outlier_winsorizer').tails).toEqual({ age: tail });
      await page.getByRole('button', { name: /Outlier Winsorizer/ }).click();
      const card = page.locator('app-station-card', { hasText: 'Outlier Handling' });
      await expect(card.getByRole('radio', { name: clip, exact: true })).toHaveAttribute('aria-checked', 'true');
    });
  }

  const longitudinalStrategies = [
    { label: 'Diff (Visit 2 - Visit 1)', strategy: 'diff' },
    { label: 'Use visit 1', strategy: 'first' },
    { label: 'Use visit 2', strategy: 'second' },
  ];
  for (const { label, strategy } of longitudinalStrategies) {
    test(`longitudinal: ${label}`, async ({ page, api }) => {
      await openLongitudinalAge(page);
      await applyLongitudinalStrategy(page, label);
      expect(previewStep(api, 'longitudinal_transformer')).toEqual({ visit1: 'bl', visit2: 'm12', strategies: { age: strategy } });
      await page.getByRole('button', { name: /Longitudinal Comparison/ }).click();
      const card = page.locator('app-station-card', { hasText: 'Longitudinal Transformation' });
      await expect(card.locator('select').last().locator('option:checked')).toHaveText(label);
    });
  }
});

test.describe('filters and transformations', () => {
  test('filters on a numeric and a nominal variable', async ({ page, api }) => {
    await openAgeAndSex(page);
    await applyFilters(page, { female: true });
    await expect(page.getByText('Age is at least 60')).toBeVisible();
    await expect(page.getByText('Sex is Female')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue to Algorithm Selection' }).last()).toBeEnabled();

    expect(lastRequest(api, 'POST', TRANSIENT, 'describe').analysis.inputdata.filters).toEqual({
      condition: 'AND',
      rules: [
        expect.objectContaining({ field: 'age', operator: 'greater_or_equal', value: 60 }),
        expect.objectContaining({ field: 'sex', operator: 'equal', value: 'F' }),
      ],
      valid: true,
    });
  });

  test('filter, preprocessing and algorithm reach the run', async ({ page, api }) => {
    await openAgeAndSex(page);
    await applyFilters(page);
    await expect(page.getByText('Age is at least 60')).toBeVisible();
    const missing = await openMissingValues(page);
    await missing.getByRole('radio', { name: /Median imputation/ }).click();
    await missing.getByRole('button', { name: 'Apply', exact: true }).click();
    await collapsePreprocessing(page);
    await expect(page.getByText('Age: Median imputation')).toBeVisible();
    await goToAlgorithms(page);
    await assignRole(page, 'Age', 'Outcome');
    await assignRole(page, 'Sex', 'Predictor');
    await expectAlgorithm(page, 'Linear regression', 'Regression');
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
    await expect(page.getByText('Age >= 60 · 1 rule')).toBeVisible();
    await expect(page.getByText('Age: median imputation, Sex: remove rows')).toBeVisible();

    const run = lastRequest(api, 'POST', TRANSIENT, 'linear_regression').analysis;
    expect(run.algorithm).toMatchObject({ y: ['age'], x: ['sex'] });
    expect(run.inputdata.filters.rules).toEqual([expect.objectContaining({ field: 'age', operator: 'greater_or_equal', value: 60 })]);
    expect(run.preprocessing).toContainEqual({
      name: 'missing_values_handler',
      parameters: { strategies: { age: 'median', sex: 'drop' } },
    });
  });

  test('k-means cluster column', async ({ page, api }) => {
    await openAgeAndSex(page);
    await addKMeansColumn(page);
    await expect(page.getByText('Column kmeans_cluster')).toBeVisible();
    expect(lastRequest(api, 'POST', TRANSIENT, 'kmeans').analysis.algorithm.y).toEqual(['age']);
  });

  test('nominal column and k-means cluster column together', async ({ page, api }) => {
    await openAgeAndSex(page);
    await addNominalColumn(page, 'sex_group', 'female', 'other');
    await addKMeansColumn(page, { stepAdded: true });
    await expect(page.getByText('Nominal column · sex_group')).toBeVisible();
    await expect(page.locator('app-station-card', { hasText: 'Nominal column · sex_group' })).toContainText('Applied');
    await expect(page.getByText('Column kmeans_cluster')).toBeVisible();
    await expect(page.getByText('Sex is Female')).toBeVisible();

    const steps = lastRequest(api, 'POST', TRANSIENT, 'describe').analysis.preprocessing;
    expect(steps).toContainEqual({
      name: 'categorical_column_creator',
      parameters: {
        code: 'sex_group',
        strategy: 'filter_rules',
        rules: { female: { condition: 'AND', rules: [expect.objectContaining({ field: 'sex', operator: 'equal', value: 'F' })], valid: true } },
        default_enumeration: 'other',
      },
    });
    expect(steps).toContainEqual({
      name: 'kmeans_cluster_creator',
      parameters: expect.objectContaining({ code: 'kmeans_cluster' }),
    });
  });
});

test.describe('run and save lifecycle', () => {
  /** Answer the polled experiment with `answers` in order, then fall back to the mock. */
  async function answerPolls(page: Page, answers: Record<string, unknown>[]) {
    let polls = 0;
    await page.route(/\/services\/experiments\/exp-created-\d+$/, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const answer = answers[polls++];
      return answer ? route.fulfill({ json: answer }) : route.fallback();
    });
    return () => polls;
  }

  async function runLinearModel(page: Page) {
    await prepareLinearRun(page);
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
  }

  test('save keeps polling while the engine reports pending', async ({ page }) => {
    const polls = await answerPolls(page, [{ uuid: 'pending', status: 'pending' }]);
    await runLinearModel(page);
    await saveExperiment(page, 'Slow save');
    // The studio polls every 5 s; the second answer is the stored success.
    await expect(page.getByText('Experiment saved successfully!')).toBeVisible({ timeout: 15_000 });
    expect(polls()).toBeGreaterThanOrEqual(2);
  });

  test('save shows the engine error', async ({ page }) => {
    await answerPolls(page, [{ uuid: 'failed', status: 'error', result: { message: 'Engine crashed' } }]);
    await runLinearModel(page);
    await saveExperiment(page, 'Broken save');
    await expect(page.getByRole('alert').filter({ hasText: 'Saving failed: Engine crashed' })).toBeVisible();
    await expect(page.getByText('Experiment saved successfully!')).toHaveCount(0);
  });

  test('save shows a failed request', async ({ page }) => {
    await page.route('**/services/experiments', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 500, json: {} }) : route.fallback(),
    );
    await runLinearModel(page);
    await saveExperiment(page, 'Rejected save');
    await expect(page.getByText('Failed to run experiment. Please try again.')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Saving failed: Experiment request failed.' })).toBeVisible();
  });

  test('run shows the engine error', async ({ page }) => {
    await page.route('**/services/experiments/transient', (route) =>
      route.request().postDataJSON()?.analysis?.algorithm?.name === 'linear_regression'
        ? route.fulfill({ json: { status: 'error', result: { message: 'Singular matrix' } } })
        : route.fallback(),
    );
    await prepareLinearRun(page);
    await runExperiment(page);
    await expect(page.getByText('The experiment did not finish')).toBeVisible();
    await expect(page.getByText('Singular matrix')).toBeVisible();
  });

  test('linear regression result shows the Exaflow fields', async ({ page }) => {
    await runLinearModel(page);
    const result = page.locator('app-execution-panel');
    await expect(result).toContainText('R²');
    await expect(result).toContainText('0.042');
    await expect(result).toContainText('F(1, 98) = 4.31');
    const sexRow = result.getByRole('row', { name: /Sex\[Male\]/ });
    await expect(sexRow).toContainText('2.05');
    await expect(sexRow).toContainText('0.090 to 4.01');
    await expect(result.getByRole('row', { name: /Intercept/ })).toContainText('71.20');
  });
});
