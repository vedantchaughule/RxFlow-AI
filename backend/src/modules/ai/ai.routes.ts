import { Router } from 'express';
import { requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { aiAssistBodySchema, aiHistoryBodySchema, aiRejectBodySchema, aiRejectParamsSchema } from './ai.schemas.js';
import * as service from './ai.service.js';

const router = Router();
const guards = [requireAuth, requirePasswordReady, requireRole('doctor')] as const;
function requestSignal(req: Parameters<typeof service.assistPrescription>[0]) {
  const controller = new AbortController();
  req.once('aborted', () => controller.abort());
  return controller.signal;
}

router.post('/prescription-assist', ...guards, validateBody(aiAssistBodySchema), asyncHandler(async (req, res) => {
  const result = await service.assistPrescription(req, req.body, requestSignal(req));
  res.json({ success: true, data: result });
}));
router.post('/history-summary', ...guards, validateBody(aiHistoryBodySchema), asyncHandler(async (req, res) => {
  const result = await service.summarizeHistory(req, req.body.patientId, requestSignal(req));
  res.json({ success: true, data: result });
}));
router.post('/runs/:runId/reject', ...guards, validateParams(aiRejectParamsSchema), validateBody(aiRejectBodySchema), asyncHandler(async (req, res) => {
  const result = await service.rejectDraft(req, String(req.params.runId), req.body.reason);
  res.json({ success: true, data: result });
}));
export default router;
