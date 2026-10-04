import { expect, Page, test } from '@playwright/test';
import { installExperimentStudioApi, seedLinearExperiment, StoredExperiment } from './experiment-studio-api';

/**
 * End-to-end experiment studio flows against a mocked `/services` API.
 * Each test is named for the flow it covers so a failure says which one broke.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mip.guide.experiments-dashboard.autostarted', 'true');
    localStorage.setItem('mip.guide.experiment-studio.seen', 'true');
    localStorage.setItem('mip.guide.experiment-studio.autostarted', 'true');
  });
});

async function boot(page: Page, experiments: StoredExperiment[] = []) {
  await installExperimentStudioApi(page, experiments);
}

async function openNewStudio(page: Page) {
  await page.goto('/experiments-dashboard');
  await page.getByRole('button', { name: 'New experiment' }).click();
  await expect(page).toHaveURL(/\/experiment-studio\/?$/);
  await expect(page.getByRole('button', { name: /Dementia/ })).toBeVisible();
}

async function addVariable(page: Page, label: string) {
  await page.getByRole('button', { name: 'Search variables or groups' }).click();
  await page.locator('#search-bar').fill(label);
  await page.locator('.search-result-item', { hasText: label }).first().click();
  await page.locator('[data-guide="guide-add-variable"]').click();
  await expect(page.locator('.pool-chip', { hasText: label })).toBeVisible();
}

async function continueFromHeader(page: Page, name: RegExp) {
  const cta = page.locator('.sub-header-cta');
  await expect(cta).toBeEnabled();
  await expect(cta).toHaveText(name);
  await cta.click();
}

async function goToDataHandling(page: Page) {
  await continueFromHeader(page, /Continue with/);
  await expect(page.getByRole('heading', { name: 'Data Handling Pipeline' })).toBeVisible();
}

async function goToAlgorithms(page: Page) {
  await continueFromHeader(page, /Continue to Algorithm Selection/);
  await expect(page.getByRole('heading', { name: 'Algorithm', exact: true })).toBeVisible();
}

async function ensureRolesOpen(page: Page) {
  const add = page.getByRole('button', { name: '+ Add' });
  if (await add.isVisible()) {
    await add.click();
  }
}

async function assignRole(page: Page, variable: string, role: 'Outcome' | 'Predictor') {
  await ensureRolesOpen(page);
  const row = page.locator('app-algorithm-role-assignment li.row', { hasText: variable });
  await row.getByRole('radio', { name: role }).click();
  const slot = role === 'Outcome' ? 'outcome' : 'predictors';
  await expect(page.getByRole('button', { name: `Remove ${variable} from ${slot}` })).toBeVisible();
}

async function clearRole(page: Page, variable: string, slot: 'outcome' | 'predictors') {
  await page.getByRole('button', { name: `Remove ${variable} from ${slot}` }).click();
}

async function chooseAlgorithm(page: Page, label: string) {
  await page.locator('#algo-search').fill(label);
  const tile = page.locator('.algo-tile', { hasText: label });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.locator('h2.algorithm-details__title')).toHaveText(label);
  return tile;
}

async function expectAlgorithm(page: Page, label: string, category: string) {
  await chooseAlgorithm(page, label);
  await expect(page.locator('.inspector-tag')).toHaveText(category);
  await expect(page.locator('.algo-tile.selected', { hasText: label })).not.toHaveClass(/disabled-algo/);
}

async function expectAlgorithmBlocked(page: Page, label: string) {
  // The catalog hides methods that cannot run until "All" is selected.
  const allMethods = page.getByRole('button', { name: /^All\b/ });
  if ((await allMethods.getAttribute('aria-pressed')) !== 'true') {
    await allMethods.click();
  }
  await page.locator('#algo-search').fill(label);
  const tile = page.locator('.algo-tile', { hasText: label });
  await expect(tile).toBeVisible();
  await expect(tile).toHaveClass(/disabled-algo/);
  await expect(tile.locator('.algo-why')).not.toHaveText('');
}

async function setAlpha(page: Page, value: string) {
  const alpha = page.locator('.config-field', { hasText: 'Alpha' }).locator('input');
  // The parameter column is clipped, so a normal fill never reaches the form control.
  await alpha.evaluate((el, next) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(alpha).toHaveValue(value);
}

async function applyMeanImputation(page: Page) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
  await missing.getByRole('button', { name: 'Set all' }).click();
  await page.getByRole('menuitem', { name: 'Set all numerical to Mean imputation' }).click();
  await missing.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(missing).toContainText(/Mean imputation|Applied/);
}

async function prepareLinearRun(page: Page) {
  await openNewStudio(page);
  await addVariable(page, 'Age');
  await addVariable(page, 'Sex');
  await goToDataHandling(page);
  await goToAlgorithms(page);
  await assignRole(page, 'Age', 'Outcome');
  await assignRole(page, 'Sex', 'Predictor');
  await expectAlgorithm(page, 'Linear regression', 'Regression');
}

test.describe('experiment studio flow', () => {
  test('create', async ({ page }) => {
    await test.step('create', async () => {
      await boot(page);
      await openNewStudio(page);
      await expect(page).not.toHaveURL(/experimentId/);
      await addVariable(page, 'Age');
      await expect(page.locator('.pool-card')).toContainText('Age');
      await expect(page.locator('.sub-header-cta')).toHaveText(/Continue with 1 variable/);
    });
  });

  test('open', async ({ page }) => {
    await test.step('open', async () => {
      await boot(page, [seedLinearExperiment()]);
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
  });

  test('edit', async ({ page }) => {
    await test.step('edit', async () => {
      await boot(page, [seedLinearExperiment()]);
      await page.goto('/experiment-studio?experimentId=exp-seed-1&mode=edit');
      await expect(page.locator('.pool-chip', { hasText: 'Age' })).toBeVisible();
      await goToDataHandling(page);
      await goToAlgorithms(page);
      const alpha = page.locator('.config-field', { hasText: 'Alpha' }).locator('input');
      await expect(alpha).toHaveValue('0.05');
      await setAlpha(page, '0.2');
      await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
    });
  });

  test('save', async ({ page }) => {
    await test.step('save', async () => {
      await boot(page);
      await prepareLinearRun(page);
      await setAlpha(page, '0.2');
      await page.locator('.sub-header-cta', { hasText: 'Run experiment' }).click();
      await expect(page.getByText('age ~ sex')).toBeVisible();

      const saved = page.waitForRequest((request) => {
        if (request.method() !== 'POST') return false;
        return new URL(request.url()).pathname === '/services/experiments';
      });
      await page.getByRole('button', { name: 'Save experiment' }).click();
      await page.locator('#save-as-name-input').fill('Age by sex');
      await page.locator('.result-save-form').getByRole('button', { name: 'Save', exact: true }).click();
      const request = await saved;
      const body = request.postDataJSON() as {
        name: string;
        analysis: { algorithm: { name: string; parameters: { alpha: number }; y: string[]; x: string[] } };
      };
      expect(body.name).toBe('Age by sex');
      expect(body.analysis.algorithm.name).toBe('linear_regression');
      expect(body.analysis.algorithm.parameters.alpha).toBe(0.2);
      expect(body.analysis.algorithm.y).toEqual(['age']);
      expect(body.analysis.algorithm.x).toEqual(['sex']);
      await expect(page.getByText('Experiment saved successfully!')).toBeVisible();
      await expect(page.getByText('Saved as “Age by sex”')).toBeVisible();
    });
  });

  test('re-open', async ({ page }) => {
    await test.step('re-open', async () => {
      await boot(page);
      await prepareLinearRun(page);
      await applyMeanImputationFromAlgorithms(page);
      await setAlpha(page, '0.2');
      await page.locator('.sub-header-cta', { hasText: 'Run experiment' }).click();
      await expect(page.getByText('age ~ sex')).toBeVisible();
      await page.getByRole('button', { name: 'Save experiment' }).click();
      await page.locator('#save-as-name-input').fill('Reopened age model');
      await page.locator('.result-save-form').getByRole('button', { name: 'Save', exact: true }).click();
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
      await expect(page.locator('.config-field', { hasText: 'Alpha' }).locator('input')).toHaveValue('0.2');
    });
  });

  test('algorithms', async ({ page }) => {
    await test.step('algorithms', async () => {
      await boot(page);
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

  test('preprocessing', async ({ page }) => {
    await test.step('preprocessing', async () => {
      await boot(page);
      await openNewStudio(page);
      await addVariable(page, 'Age');
      await addVariable(page, 'Sex');
      await goToDataHandling(page);

      await applyMeanImputation(page);

      const addOutlier = page.locator('button:visible').filter({ hasText: /Add outlier/ });
      await addOutlier.first().click();
      const outlier = page.locator('app-station-card', { hasText: 'Outlier Handling' });
      await outlier.getByRole('button', { name: 'Batch' }).click();
      await page.getByRole('menuitem', { name: 'Enable for all numerical' }).click();
      await outlier.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText(/Extreme values capped|iqr|IQR/).first()).toBeVisible();
    });
  });

  test('data handling', async ({ page }) => {
    await test.step('data handling', async () => {
      await boot(page);
      await openNewStudio(page);
      await addVariable(page, 'Age');
      await addVariable(page, 'Sex');
      await goToDataHandling(page);
      await expect(page.getByRole('heading', { name: 'Data Handling Pipeline' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Preprocessing' })).toBeVisible();

      await page.getByRole('button', { name: 'Add filtering' }).click();
      const modal = page.locator('app-filter-config-modal:visible');
      await modal.getByRole('button', { name: 'Add condition' }).click();
      const fields = modal.locator('.condition-fields').first();
      await fields.getByPlaceholder('Type to find a variable').fill('Sex');
      await fields.locator('select.filter-field-input').last().selectOption({ label: 'Female' });
      await page.locator('.filter-workflow-section').getByRole('button', { name: 'Apply filters' }).click();
      await expect(page.getByText('Sex is Female')).toBeVisible();

      await expect(page.getByRole('button', { name: 'Continue to Algorithm Selection' }).last()).toBeEnabled();
    });
  });

  test('transformation nominal column', async ({ page }) => {
    await test.step('transformation nominal column', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await addNominalColumn(page, 'sex_group', 'female', 'other');
      await expect(page.getByText('Nominal column · sex_group')).toBeVisible();
      await expect(page.getByText('Sex is Female')).toBeVisible();
      await expect(page.locator('app-station-card', { hasText: 'Nominal column · sex_group' })).toContainText('Applied');
    });
  });

  test('transformation k-means cluster column', async ({ page }) => {
    await test.step('transformation k-means cluster column', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await addKMeansColumn(page);
      await expect(page.getByText('Column kmeans_cluster')).toBeVisible();
      await expect(page.getByText(/2 clusters from age/)).toBeVisible();
    });
  });

  test('preprocessing remove rows', async ({ page }) => {
    await test.step('preprocessing remove rows', async () => {
      await boot(page);
      await openAgeAndSex(page);
      const missing = await openMissingValues(page);
      await missing.getByRole('radio', { name: /Mean imputation/ }).click();
      await missing.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText('Age: Mean imputation')).toBeVisible();
      await page.getByRole('button', { name: /Missing Values Strategy/ }).click();
      const reopened = page.locator('app-station-card', { hasText: 'Missing Values' });
      await reopened.getByRole('radio', { name: /Remove rows/ }).click();
      await reopened.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText(/Rows with missing values removed/)).toBeVisible();
    });
  });

  test('preprocessing mean imputation', async ({ page }) => {
    await test.step('preprocessing mean imputation', async () => {
      await boot(page);
      await openAgeAndSex(page);
      const missing = await openMissingValues(page);
      await missing.getByRole('radio', { name: /Mean imputation/ }).click();
      await missing.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText('Age: Mean imputation')).toBeVisible();
    });
  });

  test('preprocessing median imputation', async ({ page }) => {
    await test.step('preprocessing median imputation', async () => {
      await boot(page);
      await openAgeAndSex(page);
      const missing = await openMissingValues(page);
      await missing.getByRole('radio', { name: /Median imputation/ }).click();
      await missing.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText('Age: Median imputation')).toBeVisible();
    });
  });

  test('preprocessing constant value', async ({ page }) => {
    await test.step('preprocessing constant value', async () => {
      await boot(page);
      await openAgeAndSex(page);
      const missing = await openMissingValues(page);
      await missing.getByRole('radio', { name: /Constant value/ }).click();
      await missing.getByPlaceholder('Value').fill('70');
      await missing.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText('Age: Constant value')).toBeVisible();
    });
  });

  test('preprocessing outlier gaussian', async ({ page }) => {
    await test.step('preprocessing outlier gaussian', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, 'Gaussian');
      await expect(page.getByText(/\(Gaussian\)/)).toBeVisible();
    });
  });

  test('preprocessing outlier iqr', async ({ page }) => {
    await test.step('preprocessing outlier iqr', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, 'IQR');
      await expect(page.getByText(/\(IQR\)/)).toBeVisible();
    });
  });

  test('preprocessing outlier mad', async ({ page }) => {
    await test.step('preprocessing outlier mad', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, 'MAD');
      await expect(page.getByText(/\(MAD\)/)).toBeVisible();
    });
  });

  test('preprocessing outlier quantile', async ({ page }) => {
    await test.step('preprocessing outlier quantile', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, 'Quantile');
      await expect(page.getByText(/\(Quantile\)/)).toBeVisible();
    });
  });

  test('preprocessing outlier clip low only', async ({ page }) => {
    await test.step('preprocessing outlier clip low only', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, undefined, 'Low only');
    });
  });

  test('preprocessing outlier clip high only', async ({ page }) => {
    await test.step('preprocessing outlier clip high only', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, undefined, 'High only');
    });
  });

  test('preprocessing outlier clip both', async ({ page }) => {
    await test.step('preprocessing outlier clip both', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyOutlierChoice(page, undefined, 'Both');
    });
  });

  test('preprocessing longitudinal diff', async ({ page }) => {
    await test.step('preprocessing longitudinal diff', async () => {
      await boot(page);
      await openLongitudinalAge(page);
      const card = await openLongitudinal(page);
      await expect(card.locator('select').last().locator('option:checked')).toHaveText('Diff (Visit 2 - Visit 1)');
      await card.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText('Baseline vs Month 12')).toBeVisible();
    });
  });

  test('preprocessing longitudinal use visit 1', async ({ page }) => {
    await test.step('preprocessing longitudinal use visit 1', async () => {
      await boot(page);
      await openLongitudinalAge(page);
      await applyLongitudinalStrategy(page, 'Use visit 1');
    });
  });

  test('preprocessing longitudinal use visit 2', async ({ page }) => {
    await test.step('preprocessing longitudinal use visit 2', async () => {
      await boot(page);
      await openLongitudinalAge(page);
      await applyLongitudinalStrategy(page, 'Use visit 2');
    });
  });

  test('filters', async ({ page }) => {
    await test.step('filters', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyAgeAtLeastFilter(page);
      await expect(page.getByText('Age is at least 60')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Continue to Algorithm Selection' }).last()).toBeEnabled();
    });
  });

  test('filter preprocessing and algorithm', async ({ page }) => {
    await test.step('filter preprocessing and algorithm', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await applyAgeAtLeastFilter(page);
      await expect(page.getByText('Age is at least 60')).toBeVisible();
      const missing = await openMissingValues(page);
      await missing.getByRole('radio', { name: /Median imputation/ }).click();
      await missing.getByRole('button', { name: 'Apply', exact: true }).click();
      await collapsePipeline(page, 'Preprocessing');
      await expect(page.getByText('Age: Median imputation')).toBeVisible();
      await goToAlgorithms(page);
      await assignRole(page, 'Age', 'Outcome');
      await assignRole(page, 'Sex', 'Predictor');
      await expectAlgorithm(page, 'Linear regression', 'Regression');
      await page.locator('.sub-header-cta', { hasText: 'Run experiment' }).click();
      await expect(page.getByText('age ~ sex')).toBeVisible();
      await expect(page.getByText('Age >= 60 · 1 rule')).toBeVisible();
      await expect(page.getByText('Age: median imputation, Sex: remove rows')).toBeVisible();
    });
  });

  test('nominal column and k-means', async ({ page }) => {
    await test.step('nominal column and k-means', async () => {
      await boot(page);
      await openAgeAndSex(page);
      await addNominalColumn(page, 'sex_group', 'female', 'other');
      await addKMeansColumn(page);
      await expect(page.getByText('Nominal column · sex_group')).toBeVisible();
      await expect(page.getByText('Column kmeans_cluster')).toBeVisible();
      await expect(page.getByText('Sex is Female')).toBeVisible();
    });
  });
});


async function openAgeAndSex(page: Page) {
  await openNewStudio(page);
  await addVariable(page, 'Age');
  await addVariable(page, 'Sex');
  await goToDataHandling(page);
}

async function openMissingValues(page: Page) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
  await missing.getByRole('button', { name: /^Age/ }).click();
  return missing;
}

async function collapsePipeline(page: Page, heading: string) {
  const section = page.locator('section.pipeline-node').filter({
    has: page.getByRole('heading', { name: heading, exact: true }),
  });
  const collapse = section.getByRole('button', { name: 'Collapse', exact: true });
  if (await collapse.isVisible()) await collapse.click();
}

async function applyOutlierChoice(page: Page, method?: string, clip?: string) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  await page.locator('button:visible').filter({ hasText: /Add outlier/ }).first().click();
  const outlier = page.locator('app-station-card', { hasText: 'Outlier Handling' });
  await outlier.getByRole('button', { name: 'Batch' }).click();
  await page.getByRole('menuitem', { name: 'Enable for all numerical' }).click();
  if (method) {
    await outlier.getByRole('radio', { name: method, exact: true }).click();
  }
  if (clip) {
    await outlier.getByRole('radio', { name: clip, exact: true }).click();
  }
  await outlier.getByRole('button', { name: 'Apply', exact: true }).click();
  await collapsePipeline(page, 'Preprocessing');
  await expect(page.getByText(/Extreme values capped/)).toBeVisible();
  if (method) await expect(page.getByText(new RegExp(`\\(${method}\\)`))).toBeVisible();
  if (clip) {
    await page.getByRole('button', { name: /Outlier Winsorizer/ }).click();
    await expect(page.locator('app-station-card', { hasText: 'Outlier Handling' }).getByRole('radio', { name: clip, exact: true })).toHaveAttribute('aria-checked', 'true');
  }
}

async function selectStroke(page: Page) {
  await page.locator('.study-context-chip').click();
  await page.locator('.data-model-chip', { hasText: 'Stroke' }).click();
  await expect(page.locator('.study-context-chip')).toContainText('Stroke');
  if ((await page.locator('.study-context-chip').getAttribute('aria-expanded')) === 'true') {
    await page.locator('.study-context-chip').click();
  }
}

async function openLongitudinalAge(page: Page) {
  await openNewStudio(page);
  await selectStroke(page);
  await addVariable(page, 'Age');
  await goToDataHandling(page);
}

async function openLongitudinal(page: Page) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const card = page.locator('app-station-card', { hasText: 'Longitudinal Transformation' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /^Age/ }).click();
  return card;
}

async function applyLongitudinalStrategy(page: Page, label: string) {
  const card = await openLongitudinal(page);
  await card.locator('select').last().selectOption({ label });
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  await collapsePipeline(page, 'Preprocessing');
  await expect(page.getByText('Baseline vs Month 12')).toBeVisible();
  await page.getByRole('button', { name: /Longitudinal Comparison/ }).click();
  const reopened = page.locator('app-station-card', { hasText: 'Longitudinal Transformation' });
  await expect(reopened.locator('select').last().locator('option:checked')).toHaveText(label);
}

async function applyAgeAtLeastFilter(page: Page) {
  await page.getByRole('button', { name: 'Add filtering' }).click();
  const modal = page.locator('app-filter-config-modal:visible');
  await modal.getByRole('button', { name: 'Add condition' }).click();
  const fields = modal.locator('.condition-fields').first();
  await fields.getByPlaceholder('Type to find a variable').fill('Age');
  const operator = fields.locator('select.filter-field-input').first();
  await expect(operator).toContainText('is at least');
  await operator.selectOption({ label: 'is at least' });
  await fields.getByPlaceholder('Value').fill('60');
  await page.locator('.filter-workflow-section').getByRole('button', { name: 'Apply filters' }).click();
}

async function addNominalColumn(page: Page, code: string, category: string, fallback: string) {
  await page.getByRole('button', { name: 'Add transformation' }).click();
  await page.getByRole('button', { name: /Nominal column from rules/ }).click();
  await page.getByPlaceholder('e.g. mrs_good_outcome').fill(code);
  await page.getByRole('button', { name: /Add the first category/ }).click();
  await page.getByPlaceholder('Enumeration value').fill(category);
  const editor = page.locator('.transformation-rule-editor.is-open');
  const fields = editor.locator('.condition-fields').first();
  await fields.getByPlaceholder('Type to find a variable').fill('Sex');
  await fields.locator('select.filter-field-input').last().selectOption({ label: 'Female' });
  await editor.getByRole('button', { name: 'Done' }).click();
  await page.getByPlaceholder('unknown').fill(fallback);
  await expect(page.getByText('Sex is Female')).toBeVisible();
}

async function addKMeansColumn(page: Page) {
  const addStep = page.getByRole('button', { name: 'Add transformation' });
  if (await addStep.isVisible()) {
    await addStep.click();
  }
  await page.getByRole('button', { name: /K-means cluster column/ }).click();
  const source = page.locator('app-kmeans-cluster-source');
  await source.getByRole('button', { name: 'Run K-means report' }).click();
  await expect(source.getByText('Cluster 0')).toBeVisible();
  await source.getByRole('button', { name: 'Use as cluster column' }).click();
  await page.getByRole('button', { name: 'Back to column' }).click();
  await expect(source.getByText('Column kmeans_cluster')).toBeVisible();
  await expect(source.getByText(/2 clusters from age/)).toBeVisible();
}

/** Re-open checks that a preprocessing edit survives a later studio visit. */
async function applyMeanImputationFromAlgorithms(page: Page) {
  await page.getByRole('button', { name: 'Back to Data Handling' }).click();
  await expect(page.getByRole('heading', { name: 'Data Handling Pipeline' })).toBeVisible();
  await applyMeanImputation(page);
  await page.getByRole('button', { name: 'Continue to Algorithm Selection' }).last().click();
  await expect(page.locator('h2.algorithm-details__title')).toHaveText('Linear regression');
}
