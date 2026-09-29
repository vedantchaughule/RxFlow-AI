import { Schema, model, type InferSchemaType } from 'mongoose';

const workingHoursSchema = new Schema({
  start: { type: String, required: true, default: '09:00' },
  end: { type: String, required: true, default: '18:00' },
  breakStart: { type: String, required: true, default: '13:00' },
  breakEnd: { type: String, required: true, default: '14:00' },
}, { _id: false });

  const aiConfigSchema = new Schema({
  provider: { type: String, enum: ['openai', 'gemini', 'anthropic'] },
  baseUrl: { type: String, trim: true, maxlength: 2048 },
  modelName: { type: String, trim: true, maxlength: 160 },
  encryptedApiKey: { type: String, select: false },
    isConfigured: { type: Boolean, default: false },
    enabled: { type: Boolean, default: false },
    killSwitch: { type: Boolean, default: false },
    timeoutMs: { type: Number, min: 1000, max: 30000, default: 10000 },
    maxContextVisits: { type: Number, min: 1, max: 10, default: 5 },
}, { _id: false });

const brandingSchema = new Schema({
  primaryColor: { type: String, trim: true, default: '#0f766e' },
  accentColor: { type: String, trim: true, default: '#2563eb' },
}, { _id: false });

const whatsappConfigSchema = new Schema({
  adapter: { type: String, enum: ['cloud', 'sandbox'], default: 'sandbox' },
  apiVersion: { type: String, default: 'v26.0', match: /^v\d+\.0$/ },
  phoneNumberId: { type: String },
  whatsappBusinessAccountId: { type: String },
  encryptedAccessToken: { type: String, select: false },
  encryptedAppSecret: { type: String, select: false },
  encryptedVerifyToken: { type: String, select: false },
  webhookKey: { type: String },
  isConfigured: { type: Boolean, default: false },
}, { _id: false });

const clinicSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  city: { type: String, trim: true, maxlength: 120, default: '' },
  state: { type: String, trim: true, maxlength: 120, default: '' },
  phone: { type: String, trim: true, maxlength: 16, default: '' },
  logoUrl: { type: String, trim: true, maxlength: 2048, default: '' },
  branding: { type: brandingSchema, default: () => ({}) },
  registrationNumber: { type: String, trim: true, maxlength: 120, default: '' },
  plan: { type: String, enum: ['starter', 'growth', 'pro'], default: 'starter' },
  planExpiresAt: { type: Date },
  razorpaySubscriptionId: { type: String, select: false },
  aiConfig: { type: aiConfigSchema, default: () => ({ isConfigured: false }) },
  whatsappConfig: { type: whatsappConfigSchema, default: () => ({ adapter: 'sandbox', apiVersion: 'v26.0', isConfigured: false }) },
  workingHours: { type: workingHoursSchema, default: () => ({}) },
  maxPatientsPerHour: { type: Number, min: 1, max: 60, default: 4 },
  passwordPolicy: {
    minLength: { type: Number, default: 12, min: 12, max: 128 },
    requireUppercase: { type: Boolean, default: false },
    requireLowercase: { type: Boolean, default: false },
    requireNumber: { type: Boolean, default: false },
    requireSymbol: { type: Boolean, default: false },
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
}, { timestamps: true });

clinicSchema.index({ email: 1 }, { unique: true });
clinicSchema.index({ status: 1 });
clinicSchema.index({ 'whatsappConfig.webhookKey': 1 }, { unique: true, sparse: true });

export type Clinic = InferSchemaType<typeof clinicSchema>;
export const ClinicModel = model<Clinic>('Clinic', clinicSchema);
