import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi } from './support/mock-api';

test('@workflow admin can review every clinic setting and staff control', async ({ page }) => {
  await mockAuthenticatedApi(page, 'admin');
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Clinic settings' })).toBeVisible();
  await expect(page.getByLabel('Opening time')).toHaveValue('09:00');
  await expect(page.getByLabel('Minimum password length')).toHaveValue('12');
  await expect(page.getByText('AI is not configured')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administrative history' })).toBeVisible();
  await page.getByLabel('Search staff').fill('Dev');
  await page.getByLabel('Filter staff role').selectOption('doctor');
  await expect(page.getByText('Dev Mehta')).toBeVisible();
});

test('@a11y @visual admin settings reflow on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedApi(page, 'admin');
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Clinic settings' })).toBeVisible();
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  await expect(page).toHaveScreenshot('admin-settings-light-mobile.png', { fullPage: true });
});
