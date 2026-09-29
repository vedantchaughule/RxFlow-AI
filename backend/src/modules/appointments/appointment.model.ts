import { Schema, model, type InferSchemaType } from 'mongoose';

const appointmentSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  scheduledAt: { type: Date, required: true, index: true },
  durationMinutes: { type: Number, required: true, min: 5, max: 120, default: 15 },
  status: { type: String, enum: ['confirmed', 'pending', 'rescheduled', 'cancelled', 'completed', 'no_show'], default: 'pending', index: true },
  confirmationMessageId: { type: String, select: false },
  confirmationDeliveryStatus: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], select: false },
  patientReply: { type: String, maxlength: 100, select: false },
  patientRepliedAt: { type: Date },
}, { timestamps: true });

appointmentSchema.index({ clinicId: 1, doctorId: 1, scheduledAt: 1 }, { unique: true });
appointmentSchema.index({ clinicId: 1, patientId: 1, scheduledAt: -1 });
appointmentSchema.index({ clinicId: 1, status: 1, scheduledAt: 1 });

export type Appointment = InferSchemaType<typeof appointmentSchema>;
export const AppointmentModel = model<Appointment>('Appointment', appointmentSchema);
