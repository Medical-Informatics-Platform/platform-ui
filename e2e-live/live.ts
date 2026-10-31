import { expect, Page, test as base } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Live fixture: no request mocking. Guided tours are marked as seen, and the test fails
 * if the platform answered a /services call with a 5xx or the page threw.
 */
export const SHOTS = process.env.LIVE_SHOTS_DIR ?? 'e2e-live/test-results/shots';
mkdirSync(SHOTS, { recursive: true });

export const test = base.extend<{ serverErrors: string[] }>({
  serverErrors: [async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('mip.guide.experiments-dashboard.autostarted', 'true');
      localStorage.setItem('mip.guide.experiment-studio.seen', 'true');
      localStorage.setItem('mip.guide.experiment-studio.autostarted', 'true');
    });
    const errors: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/services/') && response.status() >= 500) {
        errors.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
      }
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
    expect(errors, 'server errors or uncaught page errors').toEqual([]);
  }, { auto: true }],
});

export { expect };

export async function shot(page: Page, name: string) {
  await page.mouse.move(1, 1);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

export async function openNewStudio(page: Page, { excludeUnloaded = true } = {}) {
  await page.goto('/experiments-dashboard');
  await page.getByRole('button', { name: 'New experiment' }).click();
  await expect(page).toHaveURL(/\/experiment-studio\/?$/);
  await expect(page.locator('.study-context-chip')).toContainText('Dementia');
  if (excludeUnloaded) await excludeUnloadedDatasets(page);
}

/**
 * The local platform lists the `*_test` datasets in its data model, but Exaflow has no
 * worker that holds them, so any request that includes them fails with
 * "Datasets ... could not be found". Deselect them, as a user of this deployment would.
 */
export const UNLOADED_DATASETS = /_test$/i;

export async function excludeUnloadedDatasets(page: Page) {
  const chip = page.locator('.study-context-chip');
  const buttons = page.locator('[data-guide="dataset-selector"] .dataset-item-btn');
  // Retry until the deselection sticks, in case the default selection lands late.
  await expect(async () => {
    if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
    await expect(buttons.first()).toBeVisible();
    const titles = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));
    const unloaded = titles.filter((title) => UNLOADED_DATASETS.test(title));
    for (const title of unloaded) {
      const button = buttons.and(page.locator(`[title="${title}"]`));
      if ((await button.getAttribute('aria-pressed')) === 'true') await button.click();
    }
    await chip.click();
    await page.waitForTimeout(1500);
    await expect(chip).toContainText(`${titles.length - unloaded.length} datasets`, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
}

export async function searchVariable(page: Page, query: string, resultLabel = query) {
  await page.getByRole('button', { name: 'Search variables or groups' }).click();
  await page.locator('#search-bar').fill(query);
  const result = page.locator('.search-result-item').filter({ has: page.locator('.search-result-label', { hasText: new RegExp(`^${resultLabel}$`) }) });
  await expect(result.first()).toBeVisible();
  await result.first().click();
}

export async function addVariable(page: Page, label: string) {
  await searchVariable(page, label);
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

export async function assignRole(page: Page, variable: string, role: 'Outcome' | 'Predictor') {
  const band = page.locator('app-algorithm-role-assignment');
  const add = band.getByRole('button', { name: '+ Add' });
  await expect(add.or(band.getByRole('button', { name: 'Done' }))).toBeVisible();
  if (await add.isVisible()) await add.click();
  await band.locator('li.row', { hasText: variable }).getByRole('radio', { name: role }).click();
  const slot = role === 'Outcome' ? 'outcome' : 'predictors';
  await expect(page.getByRole('button', { name: `Remove ${variable} from ${slot}` })).toBeVisible();
}

export async function chooseAlgorithm(page: Page, label: string) {
  await page.locator('#algo-search').fill(label);
  const tile = page.locator('.algo-tile', { hasText: label }).first();
  await expect(tile).toBeVisible();
  await tile.click();
  await expect(page.locator('h2.algorithm-details__title')).toHaveText(label);
}

export async function runExperiment(page: Page) {
  const cta = page.locator('.sub-header-cta', { hasText: 'Run experiment' });
  await expect(cta).toBeEnabled();
  await cta.click();
}
