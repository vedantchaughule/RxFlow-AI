import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi } from './support/mock-api';

test('@workflow renders the signed-out loading state while session restoration is pending', async ({ page }) => {
  let releaseRefresh!: () => void;
  const refreshReleased = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await refreshReleased;
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Session expired' } }) });
  });
  await page.goto('/app');
  await expect(page.getByRole('status', { name: 'Opening your workspace' })).toBeVisible();
  releaseRefresh();
  await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
});

test('@workflow renders an empty dashboard state', async ({ page }) => {
  await mockAuthenticatedApi(page, 'receptionist', 'empty');
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Your queue is clear' })).toBeVisible();
});

test('@workflow renders a recoverable API error state', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor', 'error');
  await page.goto('/app');
  await expect(page.getByRole('alert')).toContainText("We couldn't load today's queue");
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('@workflow renders a forbidden state without exposing clinical data', async ({ page }) => {
  await mockAuthenticatedApi(page, 'receptionist', 'forbidden');
  await page.goto('/app/patients/mock-patient');
  await expect(page.getByRole('alert')).toContainText('Prescription history is restricted for your role');
  await expect(page.getByText('Integration test diagnosis')).toHaveCount(0);
});

test('@workflow returns to login when an established session expires', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor', 'session-expired');
  await page.goto('/app');
  await expect(page).toHaveURL(/\/staff-login$/, { timeout: 5_000 });
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your session expired');
});

test('@workflow forces a disabled staff account out with a clear message', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor', 'account-disabled');
  await page.goto('/app');
  await expect(page).toHaveURL(/\/staff-login$/, { timeout: 5_000 });
  await expect(page.getByRole('alert')).toContainText('account was disabled');
});

test('@workflow keeps the protected route available for retry while offline', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) => route.abort('internetdisconnected'));
  await page.goto('/app/queue');
  await expect(page).toHaveURL(/\/app\/queue$/);
  await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
});

test('@workflow coalesces concurrent expired-token responses into one refresh rotation', async ({ page }) => {
  let refreshCount = 0;
  let queueAttempts = 0;
  let patientAttempts = 0;
  let expiredResponses = 0;
  let releaseExpiredResponses!: () => void;
  const bothRequestsExpired = new Promise<void>((resolve) => { releaseExpiredResponses = resolve; });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const ok = (data: unknown) => json(200, { success: true, data });
    if (path.endsWith('/auth/refresh')) { refreshCount += 1; return ok({ accessToken: `token-${refreshCount}` }); }
    if (path.endsWith('/auth/me')) return ok({ user: { _id: 'doctor', name: 'Dev Mehta', email: 'doctor@example.test', role: 'doctor', status: 'active', mustChangePassword: false } });
    if ((path.endsWith('/patients/queue') && queueAttempts++ === 0) || (path.endsWith('/patients') && patientAttempts++ === 0)) {
      expiredResponses += 1;
      if (expiredResponses === 2) releaseExpiredResponses();
      await bothRequestsExpired;
      return json(401, { success: false, error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } });
    }
    if (path.endsWith('/patients/queue')) return ok([]);
    if (path.endsWith('/patients')) return json(200, { success: true, data: [], pagination: { total: 0, page: 1, limit: 1, totalPages: 0 } });
    return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Your queue is clear' })).toBeVisible();
  expect(refreshCount).toBe(2);
});
