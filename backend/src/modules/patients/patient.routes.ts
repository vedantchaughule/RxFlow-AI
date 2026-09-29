import { Router } from 'express';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './patient.schemas.js';
import * as service from './patient.service.js';
import * as qrService from './patient-qr.service.js';
import { consentUpdateSchema } from '../communications/communication.schemas.js';
import { updatePatientConsent } from '../communications/communication.service.js';

const router = Router();
const patientGuards = [requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor', 'receptionist')] as const;

router.post('/', ...patientGuards, validateBody(schemas.patientCreateSchema), asyncHandler(async (req, res) => {
  const result = await service.createPatient(req, req.body);
  res.status(201).json({ success: true, data: result });
}));

router.get('/', ...patientGuards, validateQuery(schemas.patientListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listPatients(req, req.validatedQuery as schemas.PatientListQuery);
  res.json({ success: true, data: result.patients, pagination: result.pagination });
}));

router.get('/queue', ...patientGuards, validateQuery(schemas.queueListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listQueue(req, req.validatedQuery as schemas.QueueListQuery);
  res.json({ success: true, data: result.entries, pagination: result.pagination });
}));

router.patch('/queue/:queueEntryId/status', ...patientGuards, validateParams(schemas.queueEntryParamsSchema), validateBody(schemas.queueStatusUpdateSchema), asyncHandler(async (req, res) => {
  const queueEntry = await service.updateQueueStatus(req, String(req.params.queueEntryId), req.body.status);
  res.json({ success: true, data: { queueEntry } });
}));

router.get('/qr/:qrToken', ...patientGuards, validateParams(schemas.patientQrParamsSchema), asyncHandler(async (req, res) => {
  const patient = await qrService.resolvePatientQr(req, String(req.params.qrToken));
  res.json({ success: true, data: { patient } });
}));

router.post('/public-checkin/:qrToken', validateParams(schemas.patientQrParamsSchema), asyncHandler(async (req, res) => {
  const result = await qrService.publicSelfCheckInQr(String(req.params.qrToken));
  res.json({ success: true, data: result });
}));

router.get('/:patientId/qr', ...patientGuards, validateParams(schemas.patientIdParamsSchema), asyncHandler(async (req, res) => {
  const qrCode = await qrService.getOrCreatePatientQr(req, String(req.params.patientId));
  res.json({ success: true, data: { qrCode } });
}));

router.post('/:patientId/qr/rotate', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateParams(schemas.patientIdParamsSchema), asyncHandler(async (req, res) => {
  const qrCode = await qrService.rotatePatientQr(req, String(req.params.patientId));
  res.json({ success: true, data: { qrCode } });
}));

router.get('/:patientId', ...patientGuards, validateParams(schemas.patientIdParamsSchema), validateQuery(schemas.patientHistoryQuerySchema), asyncHandler(async (req, res) => {
  const history = await service.getPatientHistory(req, String(req.params.patientId), req.validatedQuery as schemas.PatientHistoryQuery);
  res.json({ success: true, data: history });
}));

router.post('/:patientId/check-ins', ...patientGuards, validateParams(schemas.patientIdParamsSchema), validateBody(schemas.patientCheckInSchema), asyncHandler(async (req, res) => {
  const result = await service.checkInExistingPatient(req, String(req.params.patientId), req.body);
  res.status(201).json({ success: true, data: result });
}));

router.patch('/:patientId/communication-consent', ...patientGuards, validateParams(schemas.patientIdParamsSchema), validateBody(consentUpdateSchema), asyncHandler(async (req, res) => {
  const consent = await updatePatientConsent(req, String(req.params.patientId), req.body);
  res.json({ success: true, data: { consent } });
}));

router.patch('/:patientId/follow-up', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor'), validateParams(schemas.patientIdParamsSchema), validateBody(schemas.patientFollowUpSchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.setPatientFollowUp(req, String(req.params.patientId), req.body as schemas.PatientFollowUpInput) });
}));

router.delete('/:patientId', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateParams(schemas.patientIdParamsSchema), asyncHandler(async (req, res) => {
  const result = await service.softDeletePatient(req, String(req.params.patientId));
  res.json({ success: true, data: result });
}));

export default router;
