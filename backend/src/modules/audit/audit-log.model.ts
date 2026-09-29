import { Schema, model, type InferSchemaType } from 'mongoose';

const auditLogSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, required: true },
  targetId: { type: String },
  ipHash: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

auditLogSchema.index({ createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema);

