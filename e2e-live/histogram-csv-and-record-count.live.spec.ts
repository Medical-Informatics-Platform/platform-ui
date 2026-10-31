import { readFileSync } from 'node:fs';
import { test, expect, shot, openNewStudio, searchVariable, addVariable, goToDataHandling } from './live';

/** Regressions for two live-only bugs: both depend on real Exaflow payloads. */

test('a numerical histogram exports its bins as a CSV download', async ({ page }) => {
  await openNewStudio(page);
  await searchVariable(page, 'Exact age');
  await expect(page.locator('#histogram-graph svg').first()).toBeVisible();

  await page.locator('#histogram-graph button[title="Export histogram"]').click();
  await shot(page, 'bug1-export-menu');
  const download = page.waitForEvent('download', { timeout: 10_000 });
  await page.locator('button[title="Export CSV"]').click();
  await shot(page, 'bug1-after-export-click');
  const file = await download;

  expect(file.suggestedFilename()).toBe('Exact_age_distribution.csv');
  const lines = readFileSync((await file.path())!, 'utf8').replace(/^\uFEFF/, '').split('\r\n');
  expect(lines[0]).toMatch(/^Bin,Count/);
  expect(lines[1]).toMatch(/^\d+(\.\d+)?–\d+(\.\d+)?,\d*/);
});

test('the pipeline summary never reports more records than the cohort has', async ({ page }) => {
  await openNewStudio(page);
  for (const variable of ['Exact age', 'MMSE Total scores', 'Gender']) await addVariable(page, variable);
  await goToDataHandling(page);

  const terminal = page.locator('.pipeline-terminal-card');
  const facts = terminal.locator('.pipeline-terminal-facts');
  const counts = async () => {
    const text = (await facts.innerText()).replace(/\s+/g, ' ');
    const match = /([\d,]+) of ([\d,]+) records/.exec(text);
    expect(match, text).not.toBeNull();
    return match!.slice(1, 3).map((value) => Number(value.replace(/,/g, '')));
  };

  await expect(facts).toContainText('records');
  const [kept, cohort] = await counts();
  expect(kept).toBeLessThan(cohort);
  await shot(page, 'bug2-default-drop');

  // Mean imputation keeps every row, so the run uses the whole cohort.
  await page.getByRole('button', { name: 'Customize rules' }).click();
  const missing = page.locator('app-station-card', { hasText: 'Missing Values' });
  await missing.getByRole('button', { name: 'Set all' }).click();
  await page.getByRole('menuitem', { name: 'Set all numerical to Mean imputation' }).click();
  await missing.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(terminal).toContainText('Preprocessing: 1 step');
  await expect(facts).toContainText(`${cohort.toLocaleString('en-US')} of ${cohort.toLocaleString('en-US')} records`);
  await terminal.scrollIntoViewIfNeeded();
  await shot(page, 'bug2-mean-imputation');
});
