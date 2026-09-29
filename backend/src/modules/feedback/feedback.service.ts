import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';
import { FeedbackModel } from './feedback.model.js';
import type { FeedbackListQuery, FeedbackRequestInput, FeedbackSubmitInput } from './feedback.schemas.js';

function authFor(req: Request) { if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required'); return req.auth; }
function tokenHash(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }
function nextDay(date: string): string { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }

export async function issueRequest(req: Request, input: FeedbackRequestInput) {
  const auth = authFor(req);
  const appointment = await AppointmentModel.findOne({ _id: input.appointmentId, clinicId: auth.clinicId }).lean();
  if (!appointment || (auth.role === 'doctor' && String(appointment.doctorId) !== auth.userId)) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  if (appointment.status !== 'completed') throw new AppError(409, 'FEEDBACK_NOT_ELIGIBLE', 'Feedback can only be requested after a completed appointment');
  const existing = await FeedbackModel.findOne({ clinicId: auth.clinicId, appointmentId: appointment._id }).lean();
  if (existing?.submittedAt) throw new AppError(409, 'FEEDBACK_ALREADY_SUBMITTED', 'Feedback has already been submitted');
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const feedback = await FeedbackModel.findOneAndUpdate(
    { clinicId: auth.clinicId, appointmentId: appointment._id },
    { $set: { tokenHash: tokenHash(token), tokenExpiresAt: expiresAt }, $setOnInsert: { patientId: appointment.patientId, doctorId: appointment.doctorId } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean();
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'feedback.request_issued', targetType: 'Feedback', targetId: String(feedback?._id), metadata: { appointmentId: input.appointmentId, expiresAt: expiresAt.toISOString() } });
  return { submissionUrl: `${env.CLIENT_URL.replace(/\/$/, '')}/feedback/${token}`, expiresAt: expiresAt.toISOString(), delivery: { status: 'not_sent', reason: 'No patient messaging integration is configured; share this consent link through an approved clinic channel.' } };
}

export async function submit(req: Request, token: string, input: FeedbackSubmitInput) {
  const feedback = await FeedbackModel.findOne({ tokenHash: tokenHash(token) }).select('+tokenHash');
  if (!feedback) throw new AppError(404, 'NOT_FOUND', 'Feedback request not found');
  if (feedback.submittedAt) throw new AppError(409, 'FEEDBACK_ALREADY_SUBMITTED', 'Feedback has already been submitted');
  if (feedback.tokenExpiresAt <= new Date()) throw new AppError(410, 'FEEDBACK_REQUEST_EXPIRED', 'Feedback request has expired');
  const now = new Date();
  feedback.consentedAt = now;
  feedback.rating = input.rating;
  feedback.comment = input.comment || undefined;
  feedback.submittedAt = now;
  await feedback.save();
  await recordAudit({ req, clinicId: String(feedback.clinicId), action: 'feedback.submitted', targetType: 'Feedback', targetId: String(feedback._id), metadata: { rating: input.rating, hasComment: Boolean(input.comment) } });
  return { accepted: true };
}

export async function list(req: Request, query: FeedbackListQuery) {
  const auth = authFor(req);
  let doctorId = query.doctorId;
  if (auth.role === 'doctor') {
    if (doctorId && doctorId !== auth.userId) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
    doctorId = auth.userId;
  } else if (doctorId && !await UserModel.exists({ _id: doctorId, clinicId: auth.clinicId, role: 'doctor' })) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
  const start = new Date(`${query.from}T00:00:00.000+05:30`);
  const endExclusive = new Date(`${nextDay(query.to)}T00:00:00.000+05:30`);
  const filter = { clinicId: auth.clinicId, submittedAt: { $gte: start, $lt: endExclusive }, ...(doctorId ? { doctorId } : {}) };
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    FeedbackModel.find(filter).select('appointmentId doctorId rating comment submittedAt visibility').sort({ submittedAt: -1 }).skip(skip).limit(query.limit).lean(),
    FeedbackModel.countDocuments(filter),
  ]);
  const doctorIds = [...new Set(rows.map((row) => String(row.doctorId)))];
  const doctors = await UserModel.find({ _id: { $in: doctorIds }, clinicId: auth.clinicId }).select('name').lean();
  const names = new Map(doctors.map((doctor) => [String(doctor._id), doctor.name]));
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'feedback.list_viewed', targetType: 'Feedback', metadata: { from: query.from, to: query.to, resultCount: rows.length, doctorScope: doctorId ? 'single' : 'clinic' } });
  return {
    feedback: rows.map((row) => ({ _id: String(row._id), appointmentId: String(row.appointmentId), doctorId: String(row.doctorId), doctorName: names.get(String(row.doctorId)) ?? 'Clinic doctor', rating: row.rating, comment: row.comment ?? '', submittedAt: row.submittedAt, visibility: row.visibility })),
    pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  };
}
