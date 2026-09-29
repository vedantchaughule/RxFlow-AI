import { Router } from 'express';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './communication.schemas.js';
import * as service from './communication.service.js';

const router = Router(); const staff = [requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor', 'receptionist')] as const;
router.post('/templates', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateBody(schemas.templateCreateSchema), asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { template: await service.createTemplate(req, req.body) } })));
router.get('/patients/:patientId/timeline', ...staff, validateParams(schemas.patientTimelineParamsSchema), validateQuery(schemas.timelineQuerySchema), asyncHandler(async (req, res) => { const result = await service.listTimeline(req, String(req.params.patientId), req.validatedQuery as schemas.TimelineQuery); res.json({ success: true, data: { messages: result.messages, adapter: result.adapter }, pagination: result.pagination }); }));
router.get('/alerts', ...staff, validateQuery(schemas.alertQuerySchema), asyncHandler(async (req, res) => { const result = await service.listAlerts(req, req.validatedQuery as schemas.AlertQuery); res.json({ success: true, data: { alerts: result.alerts }, pagination: result.pagination }); }));
export default router;
