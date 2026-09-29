import { Schema, model, type InferSchemaType } from 'mongoose';

const patientSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  assignedDoctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  registeredById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  normalizedName: { type: String, required: true, select: false, maxlength: 160 },
  phone: { type: String, required: true, trim: true, maxlength: 16 },
  communicationConsent: {
    status: { type: String, enum: ['opted_in', 'opted_out'] },
    source: { type: String, enum: ['in_person', 'paper_form', 'website', 'whatsapp'] },
    categories: { type: [String], enum: ['appointments', 'prescription_ready'], default: [] },
    capturedAt: { type: Date },
    capturedById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  age: { type: Number, required: true, min: 1, max: 120 },
  gender: { type: String, enum: ['male', 'female', 'other'], required: true },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  chiefComplaint: { type: String, trim: true, maxlength: 1000, default: '' },
  qrTokenHash: { type: String, select: false },
  qrTokenEncrypted: { type: String, select: false },
  qrIssuedAt: { type: Date },
  totalVisits: { type: Number, min: 0, default: 0 },
  lastVisitDate: { type: Date },
  nextAppointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
  followupDueDate: { type: Date },
  dropoutStatus: { type: String, enum: ['active', 'overdue_7', 'overdue_14', 'overdue_30', 'overdue_60'], default: 'active' },
  lastDropoutMessageSentAt: { type: Date },
  dropoutReplied: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
}, { timestamps: true });

patientSchema.index({ clinicId: 1, phone: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
patientSchema.index({ clinicId: 1, normalizedName: 1, isDeleted: 1 });
patientSchema.index({ clinicId: 1, qrTokenHash: 1 }, { unique: true, partialFilterExpression: { qrTokenHash: { $exists: true } } });
patientSchema.index({ clinicId: 1, assignedDoctorId: 1, isDeleted: 1 });
patientSchema.index({ clinicId: 1, dropoutStatus: 1, isDeleted: 1 });

export type Patient = InferSchemaType<typeof patientSchema>;
export const PatientModel = model<Patient>('Patient', patientSchema);
