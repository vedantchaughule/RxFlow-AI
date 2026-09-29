import { Schema, model, type InferSchemaType } from 'mongoose';

export const queueStatuses = ['waiting', 'in_consultation', 'completed', 'cancelled'] as const;
export type QueueStatus = typeof queueStatuses[number];

const visitQueueSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  checkedInById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  queueDate: { type: String, required: true },
  queueNumber: { type: Number, required: true, min: 1 },
  status: { type: String, enum: queueStatuses, default: 'waiting' },
  checkedInAt: { type: Date, required: true, default: Date.now },
  consultationStartedAt: { type: Date },
  completedAt: { type: Date },
  cancelledAt: { type: Date },
}, { timestamps: true });

visitQueueSchema.index({ clinicId: 1, doctorId: 1, queueDate: 1, queueNumber: 1 }, { unique: true });
visitQueueSchema.index({ clinicId: 1, patientId: 1, queueDate: 1 }, { unique: true });
visitQueueSchema.index(
  { clinicId: 1, patientId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['waiting', 'in_consultation'] } } },
);
visitQueueSchema.index({ clinicId: 1, doctorId: 1, queueDate: 1, status: 1, queueNumber: 1 });
visitQueueSchema.index({ clinicId: 1, patientId: 1, checkedInAt: -1 });

const queueCounterSchema = new Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

export type VisitQueueEntry = InferSchemaType<typeof visitQueueSchema>;
export const VisitQueueModel = model<VisitQueueEntry>('VisitQueue', visitQueueSchema);
export const QueueCounterModel = model('QueueCounter', queueCounterSchema);
