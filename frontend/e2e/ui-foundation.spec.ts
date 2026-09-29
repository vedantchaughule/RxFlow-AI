import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi } from './support/mock-api';

test('@workflow system theme follows the operating-system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('rxflow:color-mode', 'system'));
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('@workflow clinic branding is applied through semantic theme tokens', async ({ page }) => {
  await mockAuthenticatedApi(page, 'admin');
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Clinic settings' })).toBeVisible();
  const tokens = await page.locator('html').evaluate((element) => ({
    brand: getComputedStyle(element).getPropertyValue('--brand').trim(),
    accent: getComputedStyle(element).getPropertyValue('--accent').trim(),
  }));
  expect(tokens).toEqual({ brand: '#0f766e', accent: '#2563eb' });
});

test('@workflow mobile navigation drawer traps focus, closes on Escape, and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedApi(page, 'doctor');
  await page.goto('/app');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.focus();
  await trigger.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Clinic navigation' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(':focus')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('@workflow destructive staff actions require an accessible confirmation dialog', async ({ page }) => {
  await mockAuthenticatedApi(page, 'admin');
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Disable Dev Mehta' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Disable staff account?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('@workflow reusable fields announce validation errors', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Clinic name').fill('A');
  await page.getByLabel('Your name').fill('B');
  await page.getByLabel('Email').fill('invalid');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create clinic' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Enter at least 2 characters');
  await expect(page.getByLabel('Clinic name')).toHaveAttribute('aria-invalid', 'true');
});

test('@a11y responsive controls reflow without overflow and retain 44px primary targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedApi(page, 'receptionist');
  await page.goto('/app/patients');
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    menuHeight: document.querySelector<HTMLButtonElement>('[aria-label="Open navigation"]')?.getBoundingClientRect().height ?? 0,
    submitHeight: [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('Add patient to queue'))?.getBoundingClientRect().height ?? 0,
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.menuHeight).toBeGreaterThanOrEqual(44);
  expect(metrics.submitHeight).toBeGreaterThanOrEqual(44);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});

test('@workflow reduced-motion preference disables decorative motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.live-dot').first()).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('link', { name: 'Start your clinic' }).first()).toHaveCSS('transition-duration', '0s');
});
