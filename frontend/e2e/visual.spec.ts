import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Mode = 'light' | 'dark';

const publicPages = [
  { name: 'home', path: '/', heading: 'Clinical work, in flow.' },
  { name: 'signup', path: '/signup', heading: 'Start your clinic' },
  { name: 'admin-login', path: '/login', heading: 'Welcome back' },
  { name: 'staff-login', path: '/staff-login', heading: 'Staff sign in' },
] as const;

async function setMode(page: Page, mode: Mode) {
  await page.addInitScript((selectedMode) => {
    window.localStorage.setItem('rxflow:color-mode', selectedMode);
  }, mode);
}

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
}

for (const route of publicPages) {
  for (const mode of ['light', 'dark'] as const) {
    test(`@visual ${route.name} ${mode}`, async ({ page }) => {
      await setMode(page, mode);
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page).toHaveScreenshot(`${route.name}-${mode}.png`);
    });
  }
}

test('@a11y public authentication pages meet automated accessibility baseline', async ({ page }) => {
  for (const route of publicPages.slice(1)) {
    await setMode(page, 'light');
    await page.goto(route.path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  }
});

test('protected clinic routes redirect signed-out users', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
});

test('@visual admin dashboard with representative API states', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    });

    if (url.pathname.endsWith('/auth/refresh')) return respond({ accessToken: 'visual-test-token' });
    if (url.pathname.endsWith('/auth/me')) return respond({
      user: {
        _id: 'visual-admin',
        name: 'Ananya Rao',
        email: 'admin@example.test',
        role: 'admin',
        status: 'active',
        mustChangePassword: false,
        mfaEnrolled: false,
      },
    });
    if (url.pathname.endsWith('/patients/queue')) return respond([]);
    if (url.pathname.endsWith('/patients')) return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 1 } }),
    });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false }) });
  });

  await setMode(page, 'light');
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Good to see you, Ananya.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot('admin-dashboard-light.png');
});
