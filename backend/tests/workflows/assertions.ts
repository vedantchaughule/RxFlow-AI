/**
 * Jarvis Workflow Acceptance Test — Assertions
 *
 * Reusable assertion helpers for workflow tests.
 * Validates response schemas, security invariants, and data correctness.
 */
import { expect } from 'vitest';

// ─── Response structure ────────────────────────────────────────
export function assertSuccess(res: { status: number; body: Record<string, unknown> }, expectedStatus = 200) {
  expect(res.status, `Expected HTTP ${expectedStatus}, got ${res.status}. Body: ${JSON.stringify(res.body)}`).toBe(expectedStatus);
  expect(res.body.success, 'Expected success=true').toBe(true);
}

export function assertError(res: { status: number; body: Record<string, unknown> }, expectedStatus: number) {
  expect(res.status, `Expected HTTP ${expectedStatus}, got ${res.status}. Body: ${JSON.stringify(res.body)}`).toBe(expectedStatus);
  expect(res.body.success, 'Expected success=false').toBe(false);
  expect(res.body.error, 'Expected error object').toBeDefined();
}

// ─── Secret redaction checks ───────────────────────────────────
const FORBIDDEN_PATTERNS = [
  /MONGODB_URI/i,
  /JWT_ACCESS_SECRET/i,
  /JWT_REFRESH_SECRET/i,
  /ENCRYPTION_KEY/i,
  /JARVIS_SESSION_JWT_SECRET/i,
  /JARVIS_INTERNAL_HMAC_SECRET/i,
  /password/i,
  /apiKey/i,
  /accessToken.*:.*"ey/,   // raw JWT value
  /PLATFORM_SUPPORT_KEY/i,
];

export function assertNoSecrets(body: unknown) {
  const str = JSON.stringify(body);
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(str, `Response must not expose secret matching ${pattern}`).not.toMatch(pattern);
  }
}

// ─── Jarvis session token structure ───────────────────────────
export function assertJarvisSessionShape(data: Record<string, unknown>) {
  expect(data, 'session data must exist').toBeDefined();
  expect(data.sessionId, 'sessionId required').toBeTruthy();
  expect(data.token, 'token required').toBeTruthy();
  expect(data.agentUrl, 'agentUrl required').toBeTruthy();
  // Must not expose the raw secrets
  expect(typeof data.token).toBe('string');
  expect((data.token as string).split('.').length).toBe(3); // JWT structure
}

// ─── Phone masking ─────────────────────────────────────────────
export function assertPhoneMasked(patient: { phone?: string; maskedPhone?: string }) {
  const displayed = patient.maskedPhone ?? patient.phone ?? '';
  const digitCount = (displayed.match(/\d/g) ?? []).length;
  // Should have no more than 4 clearly visible trailing digits
  expect(digitCount).toBeLessThanOrEqual(6); // mask hides most of number
  expect(displayed).not.toMatch(/\d{10}/); // full 10-digit number should not appear
}

// ─── Tenant isolation ─────────────────────────────────────────
export function assertClinicIsolation(results: Array<{ clinicId?: string }>, expectedClinicId: string) {
  for (const r of results) {
    if (r.clinicId) {
      expect(r.clinicId.toString()).toBe(expectedClinicId);
    }
  }
}

// ─── Inventory stock status ───────────────────────────────────
export function assertStockStatus(
  item: { stockQuantity: number; reorderLevel: number; status?: string },
  expected: 'available' | 'low_stock' | 'out_of_stock'
) {
  if (item.status) {
    expect(item.status).toBe(expected);
  } else {
    // compute from raw numbers
    if (expected === 'out_of_stock') expect(item.stockQuantity).toBe(0);
    if (expected === 'low_stock') {
      expect(item.stockQuantity).toBeGreaterThan(0);
      expect(item.stockQuantity).toBeLessThanOrEqual(item.reorderLevel);
    }
    if (expected === 'available') {
      expect(item.stockQuantity).toBeGreaterThan(item.reorderLevel);
    }
  }
}

// ─── Prescription structure ───────────────────────────────────
export function assertPrescriptionFields(rx: Record<string, unknown>) {
  expect(rx.diagnosis, 'diagnosis required').toBeTruthy();
  expect(Array.isArray(rx.medicines), 'medicines must be array').toBe(true);
  const meds = rx.medicines as Array<{ name: string; dosage?: string; frequency?: string; duration?: string }>;
  expect(meds.length).toBeGreaterThan(0);
  for (const med of meds) {
    expect(med.name, 'medicine name required').toBeTruthy();
  }
}

// ─── Audit log existence ──────────────────────────────────────
export function assertAuditExists(logs: Array<Record<string, unknown>>, action: string) {
  const found = logs.find((l) => l.action === action || l.event === action);
  expect(found, `Expected audit log with action="${action}"`).toBeDefined();
}
