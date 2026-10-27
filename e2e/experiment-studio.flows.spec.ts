import { Page } from '@playwright/test';
import { seedLinearExperiment, StudioApi } from './experiment-studio-api';
import { expect, lastRequest, test } from './fixtures';
import {
  addKMeansColumn,
  addKMeansOnColumns,
  addNominalColumn,
  addPcaColumns,
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

const PREVIEW = '/services/experiments/preview';
const RUNS = '/services/experiments/runs';

/** Save must persist the kept run by id, never post the analysis to be run a second time. */
function expectNoRerun(api: StudioApi) {
  const saves = api.requests.filter((request) => request.method === 'POST' && request.path === '/services/experiments');
  expect(saves.length).toBeGreaterThan(0);
  expect(saves.every((request) => request.body?.runId && !request.body?.analysis)).toBe(true);
}

/** One preprocessing step from the latest Data review preview (`describe`). */
function previewStep(api: StudioApi, name: string) {
  const steps: { name: string; parameters: Record<string, any> }[] =
    lastRequest(api, 'POST', PREVIEW, 'describe').analysis.preprocessing ?? [];
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

    expectNoRerun(api);
    const body = api.experiments[0] as any;
    expect(body.name).toBe('Edited age model');
    expect(body.analysis).toEqual(lastRequest(api, 'POST', RUNS, 'linear_regression').analysis);
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

    // Save sends only the run id and name; the kept run supplies the analysis and result.
    expectNoRerun(api);
    const save = api.requests.find((request) => request.method === 'POST' && request.path === '/services/experiments');
    expect(save?.body).toEqual({ runId: expect.stringMatching(/^run-/), name: 'Age by sex' });
    const body = api.experiments[0] as any;
    expect(body.analysis).toEqual(lastRequest(api, 'POST', RUNS, 'linear_regression').analysis);
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

    expect(lastRequest(api, 'POST', PREVIEW, 'describe').analysis.inputdata.filters).toEqual({
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

    const run = lastRequest(api, 'POST', RUNS, 'linear_regression').analysis;
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
    expect(lastRequest(api, 'POST', PREVIEW, 'kmeans').analysis.algorithm.y).toEqual(['age']);
  });

  test('nominal column and k-means cluster column together', async ({ page, api }) => {
    await openAgeAndSex(page);
    await addNominalColumn(page, 'sex_group', 'female', 'other');
    await addKMeansColumn(page, { stepAdded: true });
    await expect(page.getByText('Nominal column · sex_group')).toBeVisible();
    await expect(page.locator('app-station-card', { hasText: 'Nominal column · sex_group' })).toContainText('Applied');
    await expect(page.getByText('Column kmeans_cluster')).toBeVisible();
    await expect(page.getByText('Sex is Female')).toBeVisible();

    const steps = lastRequest(api, 'POST', PREVIEW, 'describe').analysis.preprocessing;
    expect(steps).toContainEqual({
      name: 'categorical_column_creator',
      parameters: {
        new_column_names: ['sex_group'],
        strategy: 'filter_rules',
        rules: { female: { condition: 'AND', rules: [expect.objectContaining({ field: 'sex', operator: 'equal', value: 'F' })], valid: true } },
        default_enumeration: 'other',
      },
    });
    expect(steps).toContainEqual({
      name: 'kmeans_cluster_creator',
      parameters: expect.objectContaining({
        new_column_names: ['kmeans_cluster'],
        k: 2,
        enumeration_prefix: 'cluster_',
      }),
    });
  });

  test('PCA columns then K-means on those outputs for logistic regression', async ({ page, api }) => {
    await openNewStudio(page);
    await addVariable(page, 'Age');
    await addVariable(page, 'MMSE');
    await addVariable(page, 'Sex');
    await goToDataHandling(page);
    await addPcaColumns(page);
    await addKMeansOnColumns(page, ['pca_pc1', 'pca_pc2'], { stepAdded: true });
    await expect(page.locator('app-pca-column-source .pca-column-source-applied-code')).toHaveText('pca_pc1, pca_pc2');
    await expect(page.locator('app-kmeans-cluster-source .kmeans-cluster-source-applied-code')).toHaveText('Column kmeans_cluster');

    await goToAlgorithms(page);
    await assignRole(page, 'Sex', 'Outcome');
    await assignRole(page, 'pca_pc1', 'Predictor');
    await assignRole(page, 'kmeans_cluster', 'Predictor');
    await expectAlgorithm(page, 'Logistic regression', 'Regression');
    await runExperiment(page);

    const run = lastRequest(api, 'POST', RUNS, 'logistic_regression').analysis;
    const names = (run.preprocessing ?? []).map((step: { name: string }) => step.name);
    const pcaIndex = names.indexOf('pca_column_creator');
    const kmeansIndex = names.indexOf('kmeans_cluster_creator');
    expect(pcaIndex).toBeGreaterThanOrEqual(0);
    expect(kmeansIndex).toBeGreaterThan(pcaIndex);
    expect(run.preprocessing[pcaIndex]).toEqual({
      name: 'pca_column_creator',
      parameters: {
        variables: ['age', 'mmse'],
        selected_components: ['PC1', 'PC2'],
        new_column_names: ['pca_pc1', 'pca_pc2'],
        n_components: 2,
      },
    });
    expect(run.preprocessing[kmeansIndex]).toEqual({
      name: 'kmeans_cluster_creator',
      parameters: expect.objectContaining({
        new_column_names: ['kmeans_cluster'],
        variables: ['pca_pc1', 'pca_pc2'],
        k: 2,
        enumeration_prefix: 'cluster_',
      }),
    });
    expect(run.inputdata.variables).toEqual(expect.arrayContaining(['age', 'mmse', 'sex']));
    for (const code of ['pca_pc1', 'pca_pc2', 'kmeans_cluster']) {
      expect(run.inputdata.variables).not.toContain(code);
    }
    expect(run.algorithm).toMatchObject({
      name: 'logistic_regression',
      y: ['sex'],
      x: expect.arrayContaining(['pca_pc1', 'kmeans_cluster']),
    });
  });
});

test.describe('statistics previews', () => {
  test('variable details show the Exaflow histogram', async ({ page, api }) => {
    await openNewStudio(page);
    const histogram = page.locator('#histogram-tab-panel');
    for (const [label, ticks] of [['Age', ['55', '80', 'Count']], ['Sex', ['Male', 'Female']]] as const) {
      await page.getByRole('button', { name: 'Search variables or groups' }).click();
      await page.locator('#search-bar').fill(label);
      await page.locator('.search-result-item', { hasText: label }).first().click();
      for (const tick of ticks) await expect(histogram).toContainText(tick);
      expect(lastRequest(api, 'POST', PREVIEW, 'histogram').analysis.algorithm.y).toEqual([label.toLowerCase()]);
    }
  });

  test('raw data preview shows the Exaflow describe statistics', async ({ page }) => {
    await openAgeAndSex(page);
    await page.locator('[data-guide="analysis-source-data"] .pipeline-node-toggle').click();
    const raw = page.locator('section.pipeline-node').first();
    const cells = (metric: RegExp) => raw.getByRole('row', { name: metric }).locator('th, td');
    // Two datasets, then the federated "all datasets" column Exaflow adds.
    await expect(raw.getByRole('row').first()).toContainText(/CHUV.*ADNI.*All datasets/s);
    await expect(cells(/^Datapoints/)).toHaveText(['Datapoints', '48', '47', '95']);
    await expect(cells(/^Mean/)).toHaveText(['Mean', '71.6', '73.1', '72.34']);
    await expect(cells(/^Standard Deviation/)).toHaveText(['Standard Deviation', '7.9', '8.4', '8.14']);
    // Exaflow reports quartiles per dataset only.
    await expect(cells(/^Q1/)).toHaveText(['Q1', '66', '67', 'N/A']);
  });
});

test.describe('run and save lifecycle', () => {
  async function runLinearModel(page: Page) {
    await prepareLinearRun(page);
    await runExperiment(page);
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
  }

  /** Answer the save of the kept run with `status`, as the backend does when it fails or the run expired. */
  async function failSave(page: Page, status: number) {
    await page.route('**/services/experiments', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status, json: {} }) : route.fallback(),
    );
  }

  test('save asks for a fresh run once the kept run has expired', async ({ page }) => {
    await failSave(page, 404);
    await runLinearModel(page);
    await saveExperiment(page, 'Expired save');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Saving failed: This result is no longer available to save. Run the experiment again.' }),
    ).toBeVisible();
    await expect(page.getByText('Experiment saved successfully!')).toHaveCount(0);
  });

  test('save shows a failed request', async ({ page }) => {
    await failSave(page, 500);
    await runLinearModel(page);
    await saveExperiment(page, 'Rejected save');
    await expect(page.getByRole('alert').filter({ hasText: 'Saving failed: Failed to save the experiment. Please try again.' })).toBeVisible();
    // The reviewed result stays on screen, so the user can retry without running again.
    await expect(page.getByText('age ~ sex').first()).toBeVisible();
  });

  test('run shows the engine error', async ({ page }) => {
    await page.route('**/services/experiments/runs', (route) =>
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
    const sexRow = result.getByRole('row', { name: /Sex · Male/ });
    await expect(sexRow).toContainText('2.05');
    await expect(sexRow).toContainText('0.090 to 4.01');
    await expect(result.getByRole('row', { name: /Intercept/ })).toContainText('71.20');
  });
});
