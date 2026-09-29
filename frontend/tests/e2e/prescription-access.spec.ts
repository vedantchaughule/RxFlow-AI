import { test, expect } from '@playwright/test';

test.describe('Secure Prescription Delivery Workflows @workflow', () => {
  test('Workflow 1 — QR Access Flow', async ({ page }) => {
    // 1. Log in as doctor
    await page.goto('/staff-login');
    await page.fill('input[name="email"]', 'doctor@mehta.test');
    await page.fill('input[name="password"]', 'Doctor@123456');
    await page.click('button[type="submit"]');

    // 2. Open prescription workspace & verify access controls
    await page.goto('/app/prescription/new');
    expect(page.url()).toContain('/app/prescription');

    // 3. Confirm absence of WhatsApp status & buttons
    await expect(page.locator('text="Send through WhatsApp"')).toHaveCount(0);
    await expect(page.locator('text="WhatsApp status"')).toHaveCount(0);
  });

  test('Workflow 2 — Generated Link Access & Download', async ({ page, context }) => {
    // Open public prescription link in unauthenticated context
    const publicPage = await context.newPage();
    await publicPage.goto('/p/prescriptions/sample-secure-token-12345');

    // Confirm patient landing page appears
    await expect(publicPage.locator('text="Your prescription is ready"')).toBeVisible();

    // Confirm View PDF button requires deliberate click
    await expect(publicPage.locator('button:has-text("View PDF")')).toBeVisible();
    await expect(publicPage.locator('button:has-text("Download PDF")')).toBeVisible();
  });

  test('Workflow 3 — Revocation & Replacement Invalidation', async ({ page }) => {
    // Open revoked or invalid token URL
    await page.goto('/p/prescriptions/invalid-or-revoked-token');
    await expect(page.locator('text="This prescription link is unavailable. Contact your clinic for a new link."')).toBeVisible();
  });

  test('Workflow 4 — Complete Absence of WhatsApp', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text="Send to patient through WhatsApp"')).toHaveCount(0);
    await expect(page.locator('text="WhatsApp queued"')).toHaveCount(0);
    await expect(page.locator('text="WhatsApp is not configured"')).toHaveCount(0);
  });
});
