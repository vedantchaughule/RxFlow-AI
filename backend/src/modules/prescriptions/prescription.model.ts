import { Schema, model, type InferSchemaType } from 'mongoose';

const medicineSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  dosage: { type: String, required: true, trim: true, maxlength: 120 },
  frequency: { type: String, required: true, trim: true, maxlength: 200 },
  duration: { type: String, required: true, trim: true, maxlength: 120 },
  instructions: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const prescriptionSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true, immutable: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true, immutable: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  queueEntryId: { type: Schema.Types.ObjectId, ref: 'VisitQueue', required: true, immutable: true },
  visitDate: { type: Date, required: true, immutable: true },
  diagnosis: { type: String, required: true, trim: true, maxlength: 1000, immutable: true },
  doctorNotes: { type: String, trim: true, maxlength: 2000, default: '', immutable: true },
  medicines: { type: [medicineSchema], required: true, immutable: true, validate: [(value: unknown[]) => value.length >= 1 && value.length <= 20, 'Prescription must contain 1 to 20 medicines'] },
  source: { type: String, enum: ['manual', 'voice', 'template'], default: 'manual', immutable: true },
  templateId: { type: Schema.Types.ObjectId, ref: 'Template', immutable: true },
  clinicianConfirmedAt: { type: Date, required: true, immutable: true },
  pdfStorageKey: { type: String, select: false },
  deliveryStatus: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], default: 'pending' },
  whatsappMessageId: { type: String, select: false },
  sentAt: { type: Date },
}, { timestamps: true });

for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
  prescriptionSchema.pre(operation, function preventClinicalEdits() {
    const update = this.getUpdate() as Record<string, unknown> | null;
    const set = update && typeof update.$set === 'object' && update.$set !== null ? update.$set as Record<string, unknown> : update;
    const immutableFields = ['clinicId', 'patientId', 'doctorId', 'queueEntryId', 'visitDate', 'diagnosis', 'doctorNotes', 'medicines', 'source', 'templateId', 'clinicianConfirmedAt'];
    if (set && immutableFields.some((field) => Object.prototype.hasOwnProperty.call(set, field))) {
      throw new Error('Final prescription clinical content is immutable');
    }
  });
}

prescriptionSchema.index({ clinicId: 1, queueEntryId: 1 }, { unique: true });
prescriptionSchema.index({ clinicId: 1, patientId: 1, visitDate: -1 });
prescriptionSchema.index({ clinicId: 1, doctorId: 1, visitDate: -1 });

export type Prescription = InferSchemaType<typeof prescriptionSchema>;
export const PrescriptionModel = model<Prescription>('Prescription', prescriptionSchema);
