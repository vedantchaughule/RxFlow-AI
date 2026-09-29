import { Router } from 'express';
import { validateParams } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './prescription.schemas.js';
import * as service from './prescription.service.js';

const router = Router();

router.get('/:token/summary', validateParams(schemas.publicPrescriptionTokenParamsSchema), asyncHandler(async (req, res) => {
  const result = await service.getPublicPrescriptionSummary(String(req.params.token));
  res.json({ success: true, data: result });
}));

router.get('/:token/pdf', validateParams(schemas.publicPrescriptionTokenParamsSchema), asyncHandler(async (req, res) => {
  const pdf = await service.getPublicPrescriptionPdf(String(req.params.token));
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="rxflow-prescription.pdf"',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'X-Content-Type-Options': 'nosniff',
  }).send(pdf);
}));

router.get('/:token/pdf/download', validateParams(schemas.publicPrescriptionTokenParamsSchema), asyncHandler(async (req, res) => {
  const pdf = await service.getPublicPrescriptionPdf(String(req.params.token));
  res.status(200).set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="rxflow-prescription.pdf"',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'X-Content-Type-Options': 'nosniff',
  }).send(pdf);
}));

export default router;
