import { Router } from 'express';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './prescription.schemas.js';
import * as service from './prescription.service.js';

const router = Router();

router.post('/', requireAuth, requirePasswordReady, requireRole('doctor'), validateBody(schemas.prescriptionCreateSchema), asyncHandler(async (req, res) => {
  const result = await service.finalizeManualPrescription(req, req.body);
  res.status(201).json({ success: true, data: result });
}));

router.get('/', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor'), validateQuery(schemas.prescriptionListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listPatientPrescriptions(req, req.validatedQuery as schemas.PrescriptionListQuery);
  res.json({ success: true, data: result.prescriptions, pagination: result.pagination });
}));

router.get('/:prescriptionId/access-status', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor'), validateParams(schemas.prescriptionIdParamsSchema), asyncHandler(async (req, res) => {
  const result = await service.getPrescriptionAccessStatus(req, String(req.params.prescriptionId));
  res.json({ success: true, data: result });
}));

router.post('/:prescriptionId/share-links', requireAuth, requirePasswordReady, requireRole('doctor'), validateParams(schemas.prescriptionIdParamsSchema), asyncHandler(async (req, res) => {
  const result = await service.createPrescriptionShareLink(req, String(req.params.prescriptionId));
  res.status(201).json({ success: true, data: result });
}));

router.post('/:prescriptionId/share-links/:shareLinkId/revoke', requireAuth, requirePasswordReady, requireRole('doctor'), validateParams(schemas.shareLinkIdParamsSchema), asyncHandler(async (req, res) => {
  const result = await service.revokePrescriptionShareLink(req, String(req.params.prescriptionId), String(req.params.shareLinkId));
  res.json({ success: true, data: result });
}));

router.get('/:prescriptionId/pdf/download', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor'), validateParams(schemas.prescriptionIdParamsSchema), asyncHandler(async (req, res) => {
  const pdf = await service.getPrescriptionPdfDownload(req, String(req.params.prescriptionId));
  const fileName = `rxflow-prescription-${String(req.params.prescriptionId)}.pdf`;
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }).send(pdf);
}));

router.get('/:prescriptionId/pdf', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor'), validateParams(schemas.prescriptionIdParamsSchema), asyncHandler(async (req, res) => {
  const pdf = await service.getPrescriptionPdf(req, String(req.params.prescriptionId));
  const fileName = `prescription-${String(req.params.prescriptionId)}.pdf`;
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${fileName}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }).send(pdf);
}));

router.get('/:prescriptionId', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor'), validateParams(schemas.prescriptionIdParamsSchema), asyncHandler(async (req, res) => {
  const prescription = await service.getPrescription(req, String(req.params.prescriptionId));
  res.json({ success: true, data: { prescription } });
}));


export default router;
