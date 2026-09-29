import { Schema, model, type InferSchemaType } from 'mongoose';

const inventoryMedicineSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  normalizedName: { type: String, required: true, trim: true, maxlength: 200, select: false },
  genericName: { type: String, trim: true, maxlength: 200, default: '' },
  brandName: { type: String, trim: true, maxlength: 200, default: '' },
  dosageForm: { type: String, trim: true, maxlength: 80, default: '' },
  strength: { type: String, trim: true, maxlength: 80, default: '' },
  stockQuantity: { type: Number, required: true, min: 0, default: 0 },
  reorderLevel: { type: Number, required: true, min: 0, default: 0 },
  unit: { type: String, trim: true, maxlength: 40, default: 'units' },
  isActive: { type: Boolean, default: true, index: true },
  createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

inventoryMedicineSchema.index({ clinicId: 1, normalizedName: 1, strength: 1, dosageForm: 1 }, { unique: true });
inventoryMedicineSchema.index({ clinicId: 1, isActive: 1, stockQuantity: 1, reorderLevel: 1 });

export type InventoryMedicine = InferSchemaType<typeof inventoryMedicineSchema>;
export const InventoryMedicineModel = model<InventoryMedicine>('InventoryMedicine', inventoryMedicineSchema);
