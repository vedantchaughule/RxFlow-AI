import { expect, test } from '@playwright/test';

test('@workflow password fields offer accessible visibility controls and guidance', async ({ page }) => {
  await page.goto('/signup');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('Short');
  await expect(page.getByText('Use at least 12 characters')).toBeVisible();
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('@a11y password recovery pages meet automated accessibility baseline', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  for (const route of ['/forgot-password', '/reset-password?token=test-token']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
  }
});

test('@workflow explains a temporary account lock without exposing credentials', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const error = path.endsWith('/auth/login')
      ? { code: 'ACCOUNT_LOCKED', message: 'Account locked' }
      : { code: 'SESSION_EXPIRED', message: 'Session expired' };
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error }) });
  });
  await page.goto('/staff-login');
  await page.getByLabel('Email').fill('locked@example.test');
  await page.getByLabel('Password', { exact: true }).fill('WrongPassword!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('This account is temporarily locked after repeated sign-in attempts. Try again later or reset the password.')).toBeVisible();
});
