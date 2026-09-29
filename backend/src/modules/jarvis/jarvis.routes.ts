import { Router } from 'express';
import { requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { createJarvisSessionSchema, jarvisActionCancelParamsSchema, jarvisSessionOnlyParamsSchema, jarvisSessionParamsSchema } from './jarvis.schemas.js';
import * as service from './jarvis.service.js';

const router = Router();
const guards = [requireAuth, requirePasswordReady, requireRole('doctor')] as const;
router.get('/diagnostics', ...guards, asyncHandler(async (req, res) => res.json({ success: true, data: await service.diagnostics(req) })));
router.post('/sessions', ...guards, validateBody(createJarvisSessionSchema), asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createSession(req, req.body) })));
router.post('/sessions/:sessionId/actions/:actionId/confirm', ...guards, validateParams(jarvisSessionParamsSchema), asyncHandler(async (req, res) => res.json({ success: true, data: await service.confirmAction(req, String(req.params.sessionId), String(req.params.actionId)) })));
router.post('/sessions/:sessionId/revoke', ...guards, validateParams(jarvisSessionOnlyParamsSchema), asyncHandler(async (req, res) => res.json({ success: true, data: await service.revokeSession(req, String(req.params.sessionId)) })));
router.post('/sessions/:sessionId/actions/:actionId/cancel', ...guards, validateParams(jarvisActionCancelParamsSchema), asyncHandler(async (req, res) => res.json({ success: true, data: await service.cancelAction(req, String(req.params.sessionId), String(req.params.actionId)) })));
export default router;
