import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const text = (max: number) => z.string().trim().max(max);

export const inventoryCreateSchema = z.strictObject({
  name: text(200).min(1),
  genericName: text(200).default(''),
  brandName: text(200).default(''),
  dosageForm: text(80).default(''),
  strength: text(80).default(''),
  stockQuantity: z.coerce.number().int().min(0).max(10_000_000),
  reorderLevel: z.coerce.number().int().min(0).max(10_000_000),
  unit: text(40).default('units'),
});

export const inventoryUpdateSchema = inventoryCreateSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const inventoryStockSchema = z.strictObject({ stockQuantity: z.coerce.number().int().min(0).max(10_000_000) });
export const inventoryParamsSchema = z.strictObject({ id: objectId });
export const inventoryListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['available', 'low_stock', 'out_of_stock']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type InventoryCreateBody = z.infer<typeof inventoryCreateSchema>;
export type InventoryUpdateBody = z.infer<typeof inventoryUpdateSchema>;
