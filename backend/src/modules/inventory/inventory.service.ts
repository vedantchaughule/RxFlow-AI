import type { Request } from 'express';
import { AppError } from '../../shared/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { InventoryMedicineModel } from './inventory.model.js';
import type { InventoryCreateBody, InventoryUpdateBody } from './inventory.schemas.js';

export function normalizeMedicineName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function inventoryStatus(stockQuantity: number, reorderLevel: number): 'available' | 'low_stock' | 'out_of_stock' {
  if (stockQuantity === 0) return 'out_of_stock';
  return stockQuantity <= reorderLevel ? 'low_stock' : 'available';
}

function auth(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth;
}

function publicMedicine(document: Record<string, unknown>) {
  const stockQuantity = Number(document.stockQuantity ?? 0);
  const reorderLevel = Number(document.reorderLevel ?? 0);
  return { ...document, status: inventoryStatus(stockQuantity, reorderLevel) };
}

export async function createMedicine(req: Request, body: InventoryCreateBody) {
  const actor = auth(req);
  try {
    const medicine = await InventoryMedicineModel.create({
      ...body,
      normalizedName: normalizeMedicineName(body.name),
      clinicId: actor.clinicId,
      createdById: actor.userId,
      updatedById: actor.userId,
    });
    await recordAudit({ req, clinicId: actor.clinicId, actorUserId: actor.userId, action: 'inventory.created', targetType: 'InventoryMedicine', targetId: String(medicine._id), metadata: { stockQuantity: body.stockQuantity, reorderLevel: body.reorderLevel } });
    return publicMedicine(medicine.toObject() as unknown as Record<string, unknown>);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AppError(409, 'CONFLICT', 'This medicine and strength already exist in inventory');
    throw error;
  }
}

export async function listMedicines(req: Request, query: { q?: string; status?: string; page: number; limit: number }) {
  const actor = auth(req);
  const filter: Record<string, unknown> = { clinicId: actor.clinicId, isActive: true };
  if (query.q) {
    const safe = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { genericName: { $regex: safe, $options: 'i' } },
      { brandName: { $regex: safe, $options: 'i' } },
      { strength: { $regex: safe, $options: 'i' } },
    ];
  }
  if (query.status === 'out_of_stock') filter.stockQuantity = 0;
  if (query.status === 'available') filter.$expr = { $gt: ['$stockQuantity', '$reorderLevel'] };
  if (query.status === 'low_stock') filter.$and = [{ stockQuantity: { $gt: 0 } }, { $expr: { $lte: ['$stockQuantity', '$reorderLevel'] } }];
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    InventoryMedicineModel.find(filter).sort({ name: 1, strength: 1 }).skip(skip).limit(query.limit).lean(),
    InventoryMedicineModel.countDocuments(filter),
  ]);
  return { items: items.map((item) => publicMedicine(item as unknown as Record<string, unknown>)), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function updateMedicine(req: Request, id: string, body: InventoryUpdateBody) {
  const actor = auth(req);
  const update: Record<string, unknown> = { ...body, updatedById: actor.userId };
  if (body.name) update.normalizedName = normalizeMedicineName(body.name);
  try {
    const medicine = await InventoryMedicineModel.findOneAndUpdate({ _id: id, clinicId: actor.clinicId, isActive: true }, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
    if (!medicine) throw new AppError(404, 'NOT_FOUND', 'Inventory medicine not found');
    await recordAudit({ req, clinicId: actor.clinicId, actorUserId: actor.userId, action: 'inventory.updated', targetType: 'InventoryMedicine', targetId: id, metadata: { fields: Object.keys(body) } });
    return publicMedicine(medicine as unknown as Record<string, unknown>);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new AppError(409, 'CONFLICT', 'This medicine and strength already exist in inventory');
    throw error;
  }
}

export async function updateStock(req: Request, id: string, stockQuantity: number) {
  return updateMedicine(req, id, { stockQuantity });
}
