import { expect, Locator, Page } from '@playwright/test';

/** Page steps shared by the experiment studio and dashboard specs. */

export async function openNewStudio(page: Page) {
  await page.goto('/experiments-dashboard');
  await page.getByRole('button', { name: 'New experiment' }).click();
  await expect(page).toHaveURL(/\/experiment-studio\/?$/);
  await expect(page.getByRole('button', { name: /Dementia/ })).toBeVisible();
}

export async function addVariable(page: Page, label: string) {
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

export async function goToDataHandling(page: Page) {
  await continueFromHeader(page, /Continue with/);
  await expect(page.getByRole('heading', { name: 'Data Handling Pipeline' })).toBeVisible();
}

export async function goToAlgorithms(page: Page) {
  await continueFromHeader(page, /Continue to Algorithm Selection/);
  await expect(page.getByRole('heading', { name: 'Algorithm', exact: true })).toBeVisible();
}

export async function openAgeAndSex(page: Page) {
  await openNewStudio(page);
  await addVariable(page, 'Age');
  await addVariable(page, 'Sex');
  await goToDataHandling(page);
}

export async function assignRole(page: Page, variable: string, role: 'Outcome' | 'Predictor') {
  // The role band is either open ("Done") or folded ("+ Add"). Wait for one, then open it.
  const band = page.locator('app-algorithm-role-assignment');
  const add = band.getByRole('button', { name: '+ Add' });
  await expect(add.or(band.getByRole('button', { name: 'Done' }))).toBeVisible();
  if (await add.isVisible()) await add.click();
  await band.locator('li.row', { hasText: variable }).getByRole('radio', { name: role }).click();
  const slot = role === 'Outcome' ? 'outcome' : 'predictors';
  await expect(page.getByRole('button', { name: `Remove ${variable} from ${slot}` })).toBeVisible();
}

export async function clearRole(page: Page, variable: string, slot: 'outcome' | 'predictors') {
  await page.getByRole('button', { name: `Remove ${variable} from ${slot}` }).click();
}

export async function chooseAlgorithm(page: Page, label: string) {
  await page.locator('#algo-search').fill(label);
  const tile = page.locator('.algo-tile', { hasText: label });
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.locator('h2.algorithm-details__title')).toHaveText(label);
}

export async function expectAlgorithm(page: Page, label: string, category: string) {
  await chooseAlgorithm(page, label);
  await expect(page.locator('.inspector-tag')).toHaveText(category);
  await expect(page.locator('.algo-tile.selected', { hasText: label })).not.toHaveClass(/disabled-algo/);
}

export async function expectAlgorithmBlocked(page: Page, label: string) {
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

export function alphaInput(page: Page): Locator {
  return page.locator('.config-field', { hasText: 'Alpha' }).locator('input');
}

/** Alpha is an advanced parameter: it sits in the closed "Advanced (n)" disclosure. */
export async function setAlpha(page: Page, value: string) {
  const advanced = page.locator('details.config-advanced');
  if ((await advanced.getAttribute('open')) === null) {
    await advanced.locator('summary').click();
  }
  await alphaInput(page).fill(value);
  await expect(alphaInput(page)).toHaveValue(value);
}

/** Age as outcome, Sex as predictor, linear regression selected. */
export async function prepareLinearRun(page: Page) {
  await openAgeAndSex(page);
  await goToAlgorithms(page);
  await assignRole(page, 'Age', 'Outcome');
  await assignRole(page, 'Sex', 'Predictor');
  await expectAlgorithm(page, 'Linear regression', 'Regression');
}

export async function runExperiment(page: Page) {
  await page.locator('.sub-header-cta', { hasText: 'Run experiment' }).click();
}

/** Save the run under `name`. Resolves once the save request has been sent. */
export async function saveExperiment(page: Page, name: string) {
  await page.getByRole('button', { name: 'Save experiment' }).click();
  await page.locator('#save-as-name-input').fill(name);
  await page.locator('.result-save-form').getByRole('button', { name: 'Save', exact: true }).click();
}

export async function collapsePreprocessing(page: Page) {
  // After Apply the step is either still open ("Collapse") or folded into its step list.
  const section = page.locator('section.pipeline-node').filter({
    has: page.getByRole('heading', { name: 'Preprocessing', exact: true }),
  });
  const collapse = section.getByRole('button', { name: 'Collapse', exact: true });
  await expect(collapse.or(section.getByRole('list', { name: 'Preprocessing steps' }))).toBeVisible();
  if (await collapse.isVisible()) await collapse.click();
}

export async function openMissingValues(page: Page) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
  await missing.getByRole('button', { name: /^Age/ }).click();
  return missing;
}

/** Set every numerical variable to mean imputation with the batch menu. */
export async function applyMeanImputationToAll(page: Page) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
  await missing.getByRole('button', { name: 'Set all' }).click();
  await page.getByRole('menuitem', { name: 'Set all numerical to Mean imputation' }).click();
  await missing.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(missing).toContainText(/Mean imputation|Applied/);
}

/** Enable outlier capping for every numerical variable, optionally picking a method and tail. */
export async function applyOutlierChoice(page: Page, method?: string, clip?: string) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  await page.locator('button:visible').filter({ hasText: /Add outlier/ }).first().click();
  const outlier = page.locator('app-station-card', { hasText: 'Outlier Handling' });
  await outlier.getByRole('button', { name: 'Batch' }).click();
  await page.getByRole('menuitem', { name: 'Enable for all numerical' }).click();
  if (method) await outlier.getByRole('radio', { name: method, exact: true }).click();
  if (clip) await outlier.getByRole('radio', { name: clip, exact: true }).click();
  await outlier.getByRole('button', { name: 'Apply', exact: true }).click();
  await collapsePreprocessing(page);
  await expect(page.getByText(/Extreme values capped/)).toBeVisible();
}

async function selectStroke(page: Page) {
  const chip = page.locator('.study-context-chip');
  await chip.click();
  await page.locator('.data-model-chip', { hasText: 'Stroke' }).click();
  await expect(chip).toContainText('Stroke');
  if ((await chip.getAttribute('aria-expanded')) === 'true') await chip.click();
}

export async function openLongitudinalAge(page: Page) {
  await openNewStudio(page);
  await selectStroke(page);
  await addVariable(page, 'Age');
  await goToDataHandling(page);
}

export async function applyLongitudinalStrategy(page: Page, label: string) {
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const card = page.locator('app-station-card', { hasText: 'Longitudinal Transformation' });
  await card.getByRole('button', { name: /^Age/ }).click();
  await card.locator('select').last().selectOption({ label });
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  await collapsePreprocessing(page);
  await expect(page.getByText('Baseline vs Month 12')).toBeVisible();
}

async function addCondition(scope: Locator, variable: string) {
  // An empty builder offers "Add condition"; once a rule exists it offers "Condition" (and "Group").
  await scope.getByRole('button', { name: 'Add condition' }).or(scope.getByRole('button', { name: 'Condition', exact: true })).click();
  const fields = scope.locator('.condition-fields').last();
  await fields.getByPlaceholder('Type to find a variable').fill(variable);
  return fields;
}

/** Filter rows to Age >= 60 (and Sex = Female when `female` is set). */
export async function applyFilters(page: Page, { female = false } = {}) {
  await page.getByRole('button', { name: 'Add filtering' }).click();
  const modal = page.locator('app-filter-config-modal:visible');
  const age = await addCondition(modal, 'Age');
  const operator = age.locator('select.filter-field-input').first();
  await expect(operator).toContainText('is at least');
  await operator.selectOption({ label: 'is at least' });
  await age.getByPlaceholder('Value').fill('60');
  if (female) {
    const sex = await addCondition(modal, 'Sex');
    await sex.locator('select.filter-field-input').last().selectOption({ label: 'Female' });
  }
  await page.locator('.filter-workflow-section').getByRole('button', { name: 'Apply filters' }).click();
}

export async function addNominalColumn(page: Page, code: string, category: string, fallback: string) {
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

/** `stepAdded`: the transformation step is already open (another column was added first). */
export async function addKMeansColumn(page: Page, { stepAdded = false } = {}) {
  if (!stepAdded) await page.getByRole('button', { name: 'Add transformation' }).click();
  await page.getByRole('button', { name: /K-means cluster column/ }).click();
  const source = page.locator('app-kmeans-cluster-source');
  await source.getByRole('button', { name: 'Run K-means report' }).click();
  await expect(source.getByText('Cluster 0')).toBeVisible();
  await source.getByRole('button', { name: 'Use as cluster column' }).click();
  await page.getByRole('button', { name: 'Back to column' }).click();
  await expect(source.getByText('Column kmeans_cluster')).toBeVisible();
  await expect(source.getByText(/2 clusters from age/)).toBeVisible();
}
