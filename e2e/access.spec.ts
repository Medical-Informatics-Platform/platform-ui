import { Page } from '@playwright/test';
import { STUDIO_USER } from './experiment-studio-api';
import { expect, test } from './fixtures';

/** Sign-in, terms and notebook gating, against the mocked `/services` API. */

const ACTIVE_USER = /\/services\/activeUser(\?.*)?$/;

/** Serve the real `assets/env.js`, then these runtime values on top of its defaults. */
async function runtimeEnv(page: Page, values: Record<string, string>) {
  await page.route('**/assets/env.js', async (route) => {
    const defaults = await (await route.fetch()).text();
    await route.fulfill({
      contentType: 'application/javascript',
      body: `${defaults}\nObject.assign(window.__env, ${JSON.stringify(values)});`,
    });
  });
}

test('a signed-out user is sent to the Keycloak login with the page to return to', async ({ page }) => {
  await page.route(ACTIVE_USER, (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/services/oauth2/authorization/keycloak**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Keycloak login</h1>' }),
  );
  const login = page.waitForRequest(/\/services\/oauth2\/authorization\/keycloak/);
  await page.goto('/experiment-studio');

  const target = new URL((await login).url()).searchParams.get('frontend_redirect');
  expect(target).toBe(new URL('/experiment-studio', page.url()).toString());
  await expect(page.getByRole('heading', { name: 'Keycloak login' })).toBeVisible();
});

test('terms must be accepted first, then the requested page opens', async ({ page, api }) => {
  let agreed = false;
  await page.route(ACTIVE_USER, (route) => route.fulfill({ json: { ...STUDIO_USER, agreeNDA: agreed } }));
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/services/activeUser/agreeNDA')) agreed = true;
  });

  await page.goto('/experiment-studio');
  await expect(page).toHaveURL(/\/terms$/);
  const proceed = page.getByRole('button', { name: 'Proceed' });
  await expect(proceed).toBeDisabled();
  await page.getByLabel('I accept the Terms of Use.').check();
  await proceed.click();

  await expect(page).toHaveURL(/\/experiment-studio$/);
  expect(api.requests.some((request) => request.method === 'POST' && request.path === '/services/activeUser/agreeNDA')).toBe(true);
});

test('the notebook route is closed when notebooks are disabled', async ({ page }) => {
  await runtimeEnv(page, { NOTEBOOK_ENABLED: '0' });
  await page.goto('/notebook');
  await expect(page).toHaveURL(/\/experiments-dashboard$/);
  await expect(page.getByRole('link', { name: 'Jupyter Notebook' })).toHaveCount(0);
});

test('the notebook route opens JupyterLab when notebooks are enabled', async ({ page }) => {
  await runtimeEnv(page, { NOTEBOOK_ENABLED: '1' });
  // A Hub with a signed-in user whose server is already running.
  await page.route('**/notebook/hub/home*', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<script>xsrf_token: "e2e-token",</script>' }),
  );
  // Hub API calls carry the XSRF token as a query parameter.
  await page.route(/\/notebook\/hub\/api\/user(\?.*)?$/, (route) =>
    route.fulfill({ json: { name: 'ada', servers: { '': { ready: true, pending: null } } } }),
  );
  await page.route('**/notebook/user/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>JupyterLab</h1>' }),
  );

  await page.goto('/experiments-dashboard');
  await page.getByRole('link', { name: 'Jupyter Notebook' }).click();
  await expect(page).toHaveURL(/\/notebook$/);
  const lab = page.locator('iframe[title="Jupyter Notebook"]');
  await expect(lab).toHaveAttribute('src', /\/notebook\/user\/ada\/lab/);
  await expect(page.frameLocator('iframe[title="Jupyter Notebook"]').getByRole('heading', { name: 'JupyterLab' })).toBeVisible();
});
