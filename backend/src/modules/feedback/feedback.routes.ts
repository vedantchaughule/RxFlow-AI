import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './feedback.schemas.js';
import * as service from './feedback.service.js';

const router = Router();
const privateGuards = [requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor')] as const;
const submissionLimiter = rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 10_000 : 10, standardHeaders: true, legacyHeaders: false });

router.post('/submit/:token', submissionLimiter, validateParams(schemas.feedbackTokenParamsSchema), validateBody(schemas.feedbackSubmitSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.submit(req, String(req.params.token), req.body as schemas.FeedbackSubmitInput) });
}));
router.post('/requests', ...privateGuards, validateBody(schemas.feedbackRequestSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await service.issueRequest(req, req.body as schemas.FeedbackRequestInput) });
}));
router.get('/', ...privateGuards, validateQuery(schemas.feedbackListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.list(req, req.validatedQuery as schemas.FeedbackListQuery);
  res.json({ success: true, data: result.feedback, pagination: result.pagination });
}));

export default router;
