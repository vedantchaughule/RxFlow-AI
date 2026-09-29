import express, { Router } from 'express';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { aiConfigUpdateSchema, aiControlsUpdateSchema, auditListQuerySchema, clinicSettingsUpdateSchema } from './clinic.schemas.js';
import * as service from './clinic.service.js';
import { whatsappConfigUpdateSchema } from '../communications/communication.schemas.js';
import { updateWhatsappConfig } from '../communications/communication.service.js';

const router = Router();
const adminGuards = [requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin')] as const;

router.get('/me', ...adminGuards, asyncHandler(async (req, res) => {
  const clinic = await service.getClinicSettings(req);
  res.json({ success: true, data: { clinic } });
}));

router.patch('/me', ...adminGuards, validateBody(clinicSettingsUpdateSchema), asyncHandler(async (req, res) => {
  const clinic = await service.updateClinicSettings(req, req.body);
  res.json({ success: true, data: { clinic } });
}));

router.patch('/me/ai-config', ...adminGuards, validateBody(aiConfigUpdateSchema), asyncHandler(async (req, res) => {
  const clinic = await service.updateAiConfig(req, req.body);
  res.json({ success: true, data: { clinic } });
}));

router.patch('/me/whatsapp-config', ...adminGuards, validateBody(whatsappConfigUpdateSchema), asyncHandler(async (req, res) => {
  const whatsapp = await updateWhatsappConfig(req, req.body);
  res.json({ success: true, data: { whatsapp } });
}));

router.patch('/me/ai-controls', ...adminGuards, validateBody(aiControlsUpdateSchema), asyncHandler(async (req, res) => {
  const clinic = await service.updateAiControls(req, req.body);
  res.json({ success: true, data: { clinic } });
}));

router.put('/me/logo', ...adminGuards, express.raw({ type: () => true, limit: '2mb' }), asyncHandler(async (req, res) => {
  const logo = await service.updateClinicLogo(req, req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '', Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
  res.json({ success: true, data: { logo } });
}));

router.get('/me/logo', ...adminGuards, asyncHandler(async (req, res) => {
  const logo = await service.getClinicLogo(req);
  res.set('Content-Type', logo.contentType).set('Cache-Control', 'private, max-age=300').send(logo.data);
}));

router.get('/me/audit', ...adminGuards, validateQuery(auditListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listAdministrativeAudit(req, req.validatedQuery as never);
  res.json({ success: true, data: { events: result.events }, pagination: result.pagination });
}));

export default router;
