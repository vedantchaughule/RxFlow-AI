import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi } from './support/mock-api';

test('doctor explores real-data operational analytics and transparent dropout rules @a11y', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor');
  await page.goto('/app/analytics');
  await expect(page.getByRole('heading', { name: 'Operational analytics' })).toBeVisible();
  await expect(page.getByLabel('Daily patient volume chart')).toBeVisible();
  await expect(page.getByText('No tracked message records exist')).toBeVisible();
  await page.getByLabel('From date').fill('2026-01-10');
  await page.getByLabel('To date').fill('2026-01-12');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('66.67%').first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);

  await page.goto('/app/dropout');
  await expect(page.getByText('Follow-up due date is 30 days overdue (30-day threshold).')).toBeVisible();
  await expect(page.getByText('Rule-based only')).toBeVisible();
});

test('analytics dashboard charts remain readable across viewports @visual', async ({ page }, testInfo) => {
  await mockAuthenticatedApi(page, 'admin');
  await page.goto('/app/analytics');
  await expect(page.getByRole('heading', { name: 'Operational analytics' })).toBeVisible();
  await expect(page.locator('main')).toHaveScreenshot(`operational-analytics-${testInfo.project.name}.png`, { animations: 'disabled' });
});

test('receptionists cannot open private analytics', async ({ page }) => {
  await mockAuthenticatedApi(page, 'receptionist');
  await page.goto('/app/analytics');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('link', { name: 'Analytics' })).toHaveCount(0);
});

test('patient feedback requires consent and submits only rating plus optional comment @a11y', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }) });
    if (path.endsWith('/feedback/submit/mock-feedback-token_123456789012345678901')) return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { accepted: true } }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }) });
  });
  await page.goto('/feedback/mock-feedback-token_123456789012345678901');
  await expect(page.getByRole('heading', { name: 'How was your clinic visit?' })).toBeVisible();
  await page.getByRole('radio', { name: '4 out of 5' }).check({ force: true });
  await page.getByRole('button', { name: 'Send private feedback' }).click();
  await expect(page.getByRole('alert')).toContainText('consent');
  await page.getByRole('checkbox', { name: /I consent/ }).check();
  await page.getByLabel('Optional comments').fill('Kind staff and a clear process.');
  await page.getByRole('button', { name: 'Send private feedback' }).click();
  await expect(page.getByRole('status')).toContainText('Thank you');
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});
