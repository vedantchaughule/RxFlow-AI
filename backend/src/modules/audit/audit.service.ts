import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import { AuditLogModel } from './audit-log.model.js';
import { hashIdentifier } from '../../shared/security.js';

export async function recordAudit(input: {
  req?: Request;
  clinicId?: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  session?: ClientSession;
}): Promise<void> {
  const ip = input.req?.ip;
  const document = {
    clinicId: input.clinicId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ipHash: ip ? hashIdentifier(ip) : undefined,
    metadata: input.metadata ?? {},
  };
  if (input.session) await AuditLogModel.create([document], { session: input.session });
  else await AuditLogModel.create(document);
}
