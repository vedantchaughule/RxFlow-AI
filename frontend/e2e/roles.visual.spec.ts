import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi, type MockRole } from './support/mock-api';

for (const role of ['doctor', 'receptionist'] as MockRole[]) {
  test(`@visual ${role} dashboard with representative mocked data`, async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('rxflow:color-mode', 'light'));
    await mockAuthenticatedApi(page, role);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good to see you');
    await expect(page).toHaveScreenshot(`${role}-dashboard-light.png`);
  });
}

test('@visual receptionist dashboard patient search and registration workspace', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('rxflow:color-mode', 'light'));
  await mockAuthenticatedApi(page, 'receptionist');
  await page.goto('/app/patients');
  await expect(page.getByRole('heading', { name: 'Patient registry' })).toBeVisible();
  await expect(page).toHaveScreenshot('receptionist-patient-workflow-light.png');
});

test('@visual doctor dashboard daily queue workflow', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('rxflow:color-mode', 'light'));
  await mockAuthenticatedApi(page, 'doctor');
  await page.goto('/app/queue');
  await expect(page.getByRole('heading', { name: 'Today’s queue' })).toBeVisible();
  await expect(page).toHaveScreenshot('doctor-queue-workflow-light.png');
});

for (const role of ['admin', 'doctor', 'receptionist'] as MockRole[]) {
  test(`@a11y ${role} dashboard meets the automated accessibility baseline`, async ({ page }) => {
    await mockAuthenticatedApi(page, role);
    await page.goto('/app');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  });
}
