import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi } from './support/mock-api';

test('@workflow communication timeline shows Cloud API lifecycle events', async ({ page }) => {
  await mockAuthenticatedApi(page, 'receptionist');
  await page.goto('/app/communications');
  await expect(page.getByRole('heading', { name: 'Patient communications' })).toBeVisible();
  await expect(page.getByText('WhatsApp Cloud API')).toBeVisible();
  await expect(page.getByText('Delivered', { exact: true })).toBeVisible();
  await expect(page.getByText('Patient replied', { exact: true })).toBeVisible();
  await expect(page.getByText('CONFIRM', { exact: true })).toBeVisible();
});

test('@a11y communication timeline meets the automated accessibility baseline', async ({ page }) => {
  await mockAuthenticatedApi(page, 'receptionist');
  await page.goto('/app/communications');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});

test('@visual communication timeline', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('rxflow:color-mode', 'light'));
  await mockAuthenticatedApi(page, 'receptionist');
  await page.goto('/app/communications');
  await expect(page.getByRole('heading', { name: 'Patient communications' })).toBeVisible();
  await expect(page).toHaveScreenshot('communications-timeline-light.png');
});
