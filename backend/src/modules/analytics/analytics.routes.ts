import { Router } from 'express';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import * as schemas from './analytics.schemas.js';
import * as service from './analytics.service.js';

const router = Router();
const guards = [requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor')] as const;

router.get('/operations', ...guards, validateQuery(schemas.analyticsQuerySchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.operations(req, req.validatedQuery as schemas.AnalyticsQuery) });
}));

router.get('/operations.csv', ...guards, validateQuery(schemas.analyticsQuerySchema), asyncHandler(async (req, res) => {
  const query = req.validatedQuery as schemas.AnalyticsQuery;
  const data = await service.operations(req, query);
  await service.recordOperationsExport(req, query);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="rxflow-operational-analytics-${query.from}-to-${query.to}.csv"`,
    'Cache-Control': 'private, no-store, max-age=0',
  }).send(service.operationsCsv(data));
}));

router.get('/dropouts', ...guards, validateQuery(schemas.dropoutQuerySchema), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.dropouts(req, req.validatedQuery as schemas.DropoutQuery) });
}));

export default router;
