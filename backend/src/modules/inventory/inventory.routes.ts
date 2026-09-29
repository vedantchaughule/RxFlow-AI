import { Router } from 'express';
import { requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { inventoryCreateSchema, inventoryListQuerySchema, inventoryParamsSchema, inventoryStockSchema, inventoryUpdateSchema } from './inventory.schemas.js';
import * as service from './inventory.service.js';

const router = Router();
router.use(requireAuth, requirePasswordReady);

router.get('/', requireRole('admin', 'doctor', 'receptionist'), validateQuery(inventoryListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listMedicines(req, req.validatedQuery as never);
  res.json({ success: true, data: result.items, pagination: result.pagination });
}));
router.get('/search', requireRole('admin', 'doctor', 'receptionist'), validateQuery(inventoryListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listMedicines(req, req.validatedQuery as never);
  res.json({ success: true, data: result.items, pagination: result.pagination });
}));
router.get('/low-stock', requireRole('admin', 'doctor', 'receptionist'), validateQuery(inventoryListQuerySchema), asyncHandler(async (req, res) => {
  const query = { ...(req.validatedQuery as { q?: string; page: number; limit: number }), status: 'low_stock' };
  const result = await service.listMedicines(req, query);
  res.json({ success: true, data: result.items, pagination: result.pagination });
}));
router.post('/', requireRole('admin', 'doctor'), validateBody(inventoryCreateSchema), asyncHandler(async (req, res) => {
  const result = await service.createMedicine(req, req.body);
  res.status(201).json({ success: true, data: result });
}));
router.patch('/:id', requireRole('admin', 'doctor'), validateParams(inventoryParamsSchema), validateBody(inventoryUpdateSchema), asyncHandler(async (req, res) => {
  const result = await service.updateMedicine(req, String(req.params.id), req.body);
  res.json({ success: true, data: result });
}));
router.patch('/:id/stock', requireRole('admin', 'doctor'), validateParams(inventoryParamsSchema), validateBody(inventoryStockSchema), asyncHandler(async (req, res) => {
  const result = await service.updateStock(req, String(req.params.id), req.body.stockQuantity);
  res.json({ success: true, data: result });
}));

export default router;
