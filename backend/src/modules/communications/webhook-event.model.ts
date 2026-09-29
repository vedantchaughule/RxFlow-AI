import { Schema, model, type InferSchemaType } from 'mongoose';
const webhookEventSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  eventKey: { type: String, required: true },
  kind: { type: String, enum: ['status', 'message'], required: true },
  processedAt: { type: Date },
}, { timestamps: true });
webhookEventSchema.index({ clinicId: 1, eventKey: 1 }, { unique: true });
export type WebhookEvent = InferSchemaType<typeof webhookEventSchema>;
export const WebhookEventModel = model<WebhookEvent>('WebhookEvent', webhookEventSchema);
