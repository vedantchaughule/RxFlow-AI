import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAuthenticatedApi } from './support/mock-api';

const draft = { runId: '507f1f77bcf86cd799439011', label: 'AI-generated draft', requiresDoctorReview: true, contextSources: ['Doctor-provided notes'], disclaimer: 'Draft assistance only. The doctor must review and confirm every field.', output: { diagnosis: 'Synthetic draft diagnosis', doctorNotes: 'Synthetic draft note', medicines: [{ name: 'Synthetic medicine', dosage: '500 mg', frequency: 'twice daily', duration: '3 days', instructions: 'After food' }], patientInstructions: 'Review if symptoms persist.', missingFields: [], conflicts: [], safetyWarnings: [], insufficientContext: false } };

test('@workflow doctor reviews, applies, and can reject an explicitly labelled AI draft', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor');
  await page.route('**/api/v1/ai/**', (route) => route.request().url().includes('/reject') ? route.fulfill({ json: { success: true, data: { rejected: true } } }) : route.fulfill({ json: { success: true, data: draft } }));
  await page.goto('/app/prescription/new?patientId=mock-patient');
  await page.getByLabel('Doctor notes for AI assistance').fill('Synthetic notes for structuring');
  await page.getByRole('button', { name: 'Create AI draft' }).click();
  await expect(page.getByText('AI-generated draft')).toBeVisible();
  await expect(page.getByText('Doctor-provided notes')).toBeVisible();
  await page.getByRole('button', { name: 'Apply draft for review' }).click();
  await expect(page.getByLabel('Diagnosis')).toHaveValue('Synthetic draft diagnosis');
  await expect(page.getByLabel('Clinician review confirmation')).not.toBeChecked();
  await page.getByRole('button', { name: 'Reject AI draft' }).click();
  await expect(page.getByText('AI-generated draft')).not.toBeVisible();
});

test('@workflow AI provider failure preserves manual prescription fallback', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor');
  await page.route('**/api/v1/ai/prescription-assist', (route) => route.fulfill({ status: 503, json: { success: false, error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider unavailable. Continue manually.' } } }));
  await page.goto('/app/prescription/new');
  await page.getByLabel('Doctor notes for AI assistance').fill('Synthetic notes');
  await page.getByRole('button', { name: 'Create AI draft' }).click();
  await expect(page.getByRole('alert')).toContainText('Continue manually');
  await expect(page.getByLabel('Diagnosis')).toBeEditable();
});

test('@a11y AI review workspace has no critical or serious violations', async ({ page }) => {
  await mockAuthenticatedApi(page, 'doctor');
  await page.route('**/api/v1/ai/prescription-assist', (route) => route.fulfill({ json: { success: true, data: draft } }));
  await page.goto('/app/prescription/new');
  await page.getByLabel('Doctor notes for AI assistance').fill('Synthetic notes');
  await page.getByRole('button', { name: 'Create AI draft' }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((item) => ['critical', 'serious'].includes(item.impact ?? ''))).toEqual([]);
});
