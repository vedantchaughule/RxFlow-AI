import { Router } from 'express';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './appointment.schemas.js';
import * as service from './appointment.service.js';

const router = Router();
const guards = [requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor', 'receptionist')] as const;
router.post('/', ...guards, validateBody(schemas.appointmentCreateSchema), asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createAppointment(req, req.body) })));
router.get('/board', ...guards, validateQuery(schemas.appointmentListQuerySchema), asyncHandler(async (req, res) => res.json({ success: true, data: await service.appointmentBoard(req, req.validatedQuery as schemas.AppointmentListQuery) })));
router.get('/slots', ...guards, validateQuery(schemas.appointmentSlotsQuerySchema), asyncHandler(async (req, res) => res.json({ success: true, data: await service.availableSlots(req, req.validatedQuery as schemas.AppointmentSlotsQuery) })));
router.patch('/:appointmentId/status', ...guards, validateParams(schemas.appointmentIdParamsSchema), validateBody(schemas.appointmentStatusSchema), asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateAppointmentStatus(req, String(req.params.appointmentId), req.body as schemas.AppointmentStatusInput) })));
export default router;
