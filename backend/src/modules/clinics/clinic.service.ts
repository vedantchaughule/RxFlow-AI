import type { Request } from 'express';
import { recordAudit } from '../audit/audit.service.js';
import { AppError } from '../../shared/errors.js';
import { encrypt } from '../../shared/encryption.js';
import { ClinicModel } from './clinic.model.js';
import { ClinicLogoModel } from './clinic-logo.model.js';
import { AuditLogModel } from '../audit/audit-log.model.js';
import { UserModel } from '../users/user.model.js';
import type { AiConfigUpdate, AiControlsUpdate, AuditListQuery, ClinicSettingsUpdate } from './clinic.schemas.js';

const publicFields = 'name email address city state phone logoUrl branding registrationNumber plan planExpiresAt aiConfig whatsappConfig workingHours maxPatientsPerHour passwordPolicy status createdAt updatedAt';

function toPublicClinic(clinic: Record<string, unknown>) {
  const aiConfig = clinic.aiConfig as Record<string, unknown> | undefined;
  return {
    ...clinic,
    aiConfig: {
      provider: aiConfig?.provider,
      baseUrl: aiConfig?.baseUrl,
      modelName: aiConfig?.modelName,
      isConfigured: aiConfig?.isConfigured === true,
      enabled: aiConfig?.enabled === true,
      killSwitch: aiConfig?.killSwitch === true,
      timeoutMs: aiConfig?.timeoutMs ?? 10000,
      maxContextVisits: aiConfig?.maxContextVisits ?? 5,
    },
    whatsappConfig: {
      adapter: (clinic.whatsappConfig as Record<string, unknown> | undefined)?.adapter ?? 'sandbox',
      apiVersion: (clinic.whatsappConfig as Record<string, unknown> | undefined)?.apiVersion ?? 'v26.0',
      phoneNumberId: (clinic.whatsappConfig as Record<string, unknown> | undefined)?.phoneNumberId,
      whatsappBusinessAccountId: (clinic.whatsappConfig as Record<string, unknown> | undefined)?.whatsappBusinessAccountId,
      isConfigured: (clinic.whatsappConfig as Record<string, unknown> | undefined)?.isConfigured === true,
    },
  };
}

const logoSignatures: Record<string, (data: Buffer) => boolean> = {
  'image/png': (data) => data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  'image/webp': (data) => data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP',
};

export async function updateClinicLogo(req: Request, contentType: string, data: Buffer) {
  const { clinicId, userId } = requireClinicAuth(req);
  const matches = logoSignatures[contentType];
  if (!matches) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Logo must be a PNG, JPEG, or WebP image');
  if (data.length === 0 || !matches(data)) throw new AppError(400, 'INVALID_FILE', 'Logo file content does not match its image type');
  if (data.length > 2 * 1024 * 1024) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Logo must be 2 MB or smaller');
  const clinic = await ClinicModel.findOne({ _id: clinicId, status: 'active' }).select('_id').lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  await ClinicLogoModel.findOneAndUpdate({ clinicId }, { $set: { contentType, data, size: data.length } }, { upsert: true, runValidators: true });
  await ClinicModel.updateOne({ _id: clinicId }, { $set: { logoUrl: '/api/v1/clinic/me/logo' } });
  await recordAudit({ req, clinicId, actorUserId: userId, action: 'clinic.logo_updated', targetType: 'Clinic', targetId: clinicId, metadata: { contentType, size: data.length } });
  return { url: '/api/v1/clinic/me/logo', contentType, size: data.length };
}

export async function getClinicLogo(req: Request) {
  const { clinicId } = requireClinicAuth(req);
  const logo = await ClinicLogoModel.findOne({ clinicId }).select('+data');
  if (!logo) throw new AppError(404, 'NOT_FOUND', 'Clinic logo not found');
  return { contentType: logo.contentType, data: Buffer.from(logo.data) };
}

export async function listAdministrativeAudit(req: Request, query: AuditListQuery) {
  const { clinicId } = requireClinicAuth(req);
  const allowedActions = ['clinic.settings_updated', 'clinic.logo_updated', 'clinic.ai_config_updated', 'clinic.ai_controls_updated', 'clinic.whatsapp_config_updated', 'communication.template_registered', 'staff.created', 'staff.active', 'staff.disabled', 'staff.password_reset'];
  const filter = { clinicId, action: query.action ?? { $in: allowedActions } };
  const [events, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).select('actorUserId action targetType targetId metadata createdAt').lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  const actorIds = [...new Set(events.flatMap((event) => event.actorUserId ? [String(event.actorUserId)] : []))];
  const actors = await UserModel.find({ _id: { $in: actorIds }, clinicId }).select('name role').lean();
  const actorMap = new Map(actors.map((actor) => [String(actor._id), { _id: String(actor._id), name: actor.name, role: actor.role }]));
  return {
    events: events.map((event) => ({ ...event, actor: event.actorUserId ? actorMap.get(String(event.actorUserId)) : undefined })),
    pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  };
}

function requireClinicAuth(req: Request): { clinicId: string; userId: string } {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return { clinicId: req.auth.clinicId, userId: req.auth.userId };
}

export async function getClinicSettings(req: Request) {
  const { clinicId } = requireClinicAuth(req);
  const clinic = await ClinicModel.findOne({ _id: clinicId, status: 'active' }).select(publicFields).lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  return toPublicClinic(clinic as unknown as Record<string, unknown>);
}

export async function updateClinicSettings(req: Request, input: ClinicSettingsUpdate) {
  const { clinicId, userId } = requireClinicAuth(req);
  if (input.email && await ClinicModel.exists({ _id: { $ne: clinicId }, email: input.email })) throw new AppError(409, 'CONFLICT', 'Another clinic already uses this contact email');
  const clinic = await ClinicModel.findOneAndUpdate(
    { _id: clinicId, status: 'active' },
    { $set: input },
    { returnDocument: 'after', runValidators: true },
  ).select(publicFields).lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  await recordAudit({
    req,
    clinicId,
    actorUserId: userId,
    action: 'clinic.settings_updated',
    targetType: 'Clinic',
    targetId: clinicId,
    metadata: { fields: Object.keys(input).sort() },
  });
  return toPublicClinic(clinic as unknown as Record<string, unknown>);
}

export async function updateAiConfig(req: Request, input: AiConfigUpdate) {
  const { clinicId, userId } = requireClinicAuth(req);
  const clinic = await ClinicModel.findOneAndUpdate(
    { _id: clinicId, status: 'active' },
    {
      $set: {
        aiConfig: {
          provider: input.provider,
          baseUrl: input.baseUrl,
          modelName: input.modelName,
          encryptedApiKey: encrypt(input.apiKey),
          isConfigured: true,
          enabled: input.enabled,
          killSwitch: false,
          timeoutMs: input.timeoutMs,
          maxContextVisits: input.maxContextVisits,
        },
      },
    },
    { returnDocument: 'after', runValidators: true },
  ).select(publicFields).lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  await recordAudit({
    req,
    clinicId,
    actorUserId: userId,
    action: 'clinic.ai_config_updated',
    targetType: 'Clinic',
    targetId: clinicId,
    metadata: { provider: input.provider, modelName: input.modelName },
  });
  return toPublicClinic(clinic as unknown as Record<string, unknown>);
}

export async function updateAiControls(req: Request, input: AiControlsUpdate) {
  const { clinicId, userId } = requireClinicAuth(req);
  const clinic = await ClinicModel.findOneAndUpdate(
    { _id: clinicId, status: 'active', 'aiConfig.isConfigured': true },
    { $set: { 'aiConfig.enabled': input.enabled, 'aiConfig.killSwitch': input.killSwitch, 'aiConfig.timeoutMs': input.timeoutMs, 'aiConfig.maxContextVisits': input.maxContextVisits } },
    { returnDocument: 'after', runValidators: true },
  ).select(publicFields).lean();
  if (!clinic) throw new AppError(409, 'AI_NOT_CONFIGURED', 'Configure an AI provider before enabling assistance');
  await recordAudit({ req, clinicId, actorUserId: userId, action: 'clinic.ai_controls_updated', targetType: 'Clinic', targetId: clinicId, metadata: input });
  return toPublicClinic(clinic as unknown as Record<string, unknown>);
}
