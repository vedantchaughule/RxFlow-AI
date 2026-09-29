import { expect, test, type Page } from '@playwright/test';

const password = 'FactoryPassword!123';

async function login(page: Page, path: '/login' | '/staff-login', email: string): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(?:app|change-password)$/);
}

test('@workflow admin signs in with a password and reaches admin-only settings', async ({ page }) => {
  await login(page, '/login', 'admin-2@example.test');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New prescription' })).toHaveCount(0);
});

test('@workflow doctor signs in and sees doctor-authorized actions only', async ({ page }) => {
  await login(page, '/staff-login', 'doctor-3@example.test');
  await expect(page.getByRole('link', { name: 'New prescription' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});

test('@workflow returns staff to the protected route requested before sign-in', async ({ page }) => {
  await page.goto('/app/queue');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('doctor-3@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/queue$/);
  await expect(page.getByRole('heading', { name: 'Today’s queue' })).toBeVisible();
});

test('@workflow receptionist signs in and registers a patient in the isolated seed database', async ({ page }) => {
  await login(page, '/staff-login', 'receptionist-4@example.test');
  await page.getByRole('link', { name: 'Patients' }).click();
  await page.getByLabel('Full name').fill('Workflow Patient');
  await page.getByLabel('WhatsApp number').fill('+919111110001');
  await page.getByLabel('Age').fill('31');
  await page.getByLabel('Doctor').selectOption({ label: 'Factory doctor 3' });
  await page.getByLabel('Chief complaint').fill('Workflow test visit');
  await page.getByRole('button', { name: 'Add patient to queue' }).click();
  await expect(page.getByRole('heading', { name: 'Patient registered' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR code for Workflow Patient' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download QR' })).toHaveAttribute('download', /workflow-patient-qr\.png/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('link', { name: 'New prescription' })).toHaveCount(0);
});

test('@workflow receptionist confirms a masked returning patient identity, repeats check-in, and cancels the queue entry', async ({ page }) => {
  await login(page, '/staff-login', 'receptionist-4@example.test');
  await page.getByRole('link', { name: 'Patients' }).click();
  await page.getByLabel('Search patient name').fill('Returning Patient');
  await expect(page.getByText('Returning Patient', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/\+91\*+0010/)).toBeVisible();
  await page.getByRole('button', { name: 'Check in Returning Patient' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Confirm patient identity' });
  await expect(dialog).toContainText(/\+91\*+0010/);
  await dialog.getByRole('button', { name: 'Confirm check-in' }).click();
  await expect(page.getByText('Returning patient checked into the queue')).toBeVisible();
  await page.getByRole('link', { name: 'Today’s queue' }).click();
  const queueRow = page.getByLabel('Clinic queue').getByText('Returning Patient').first().locator('..').locator('..');
  await expect(queueRow).toContainText('waiting');
  await queueRow.getByRole('button', { name: 'Cancel Returning Patient' }).click();
  await expect(queueRow).toContainText('cancelled');
});

test('@workflow receptionist displays, downloads, and resolves an opaque patient QR', async ({ page }) => {
  await login(page, '/staff-login', 'receptionist-4@example.test');
  await page.goto('/app/patients/000000000000000000000010');
  await expect(page.getByRole('img', { name: 'QR code for Returning Patient' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download QR' })).toHaveAttribute('download', /returning-patient-qr\.png/);
  await page.getByRole('link', { name: 'Resolve QR' }).click();
  await page.getByLabel('QR link or token').fill('rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr');
  await page.getByRole('button', { name: 'Resolve patient' }).click();
  await expect(page).toHaveURL(/\/app\/patients\/000000000000000000000010$/);
});

test('@workflow doctor advances only their queue from consultation to completed and sees visit history', async ({ page }) => {
  await login(page, '/staff-login', 'doctor-3@example.test');
  await page.getByRole('link', { name: 'Today’s queue' }).click();
  const queueRow = page.getByLabel('Clinic queue').getByText('Factory Patient 5').first().locator('..').locator('..');
  await expect(queueRow).toContainText('in consultation');
  await queueRow.getByRole('button', { name: 'Complete Factory Patient 5' }).click();
  await expect(queueRow).toContainText('completed');
  await page.goto('/app/patients/3abb25da77ce1ffdeadacae3');
  await expect(page.getByRole('heading', { name: 'Visit history' })).toBeVisible();
  await expect(page.getByText('completed', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Prescription', exact: true })).toBeVisible();
});

test('@workflow temporary-password staff completes first sign-in and must log in again', async ({ page }) => {
  await login(page, '/staff-login', 'receptionist-8@example.test');
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
  await page.getByLabel('New password (min. 12 characters)').fill('WorkflowChanged!456');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/staff-login$/);
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
});

test('@workflow logout revokes the current session and protects return navigation', async ({ page }) => {
  await login(page, '/staff-login', 'doctor-3@example.test');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/staff-login$/);
});

test('@workflow administrator requests and completes a captured password reset', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('admin-2@example.test');
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/auth/password/forgot') && response.status() === 202);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const payload = await (await responsePromise).json();
  expect(payload.data.developmentResetUrl).toBeTruthy();
  await page.goto(payload.data.developmentResetUrl);
  await page.getByLabel('New password').fill('WorkflowReset!789');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toContainText('Password reset complete');
});
