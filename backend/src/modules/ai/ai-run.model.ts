import { Schema, model, type InferSchemaType } from 'mongoose';

const aiRunSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true, immutable: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', index: true, immutable: true },
  task: { type: String, required: true, enum: ['structured_draft', 'complete_fields', 'improve_instructions', 'check_conflicts', 'history_summary'], immutable: true },
  provider: { type: String, required: true, enum: ['openai', 'gemini', 'anthropic'], immutable: true },
  modelName: { type: String, required: true, maxlength: 160, immutable: true },
  status: { type: String, required: true, enum: ['succeeded', 'failed', 'rejected'], index: true },
  latencyMs: { type: Number, required: true, min: 0 },
  inputTokens: { type: Number, min: 0 },
  outputTokens: { type: Number, min: 0 },
  estimatedCostMicros: { type: Number, min: 0 },
  contextVisitCount: { type: Number, required: true, min: 0, max: 10 },
  failureCode: { type: String, maxlength: 80 },
  rejectionReason: { type: String, enum: ['unsafe', 'incorrect', 'irrelevant', 'incomplete', 'other'] },
}, { timestamps: true });

aiRunSchema.index({ clinicId: 1, createdAt: -1 });
export type AiRun = InferSchemaType<typeof aiRunSchema>;
export const AiRunModel = model<AiRun>('AiRun', aiRunSchema);
