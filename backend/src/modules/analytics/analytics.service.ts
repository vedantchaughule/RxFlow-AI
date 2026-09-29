import type { Request } from 'express';
import { AppError } from '../../shared/errors.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { CommunicationMessageModel } from '../communications/communication-message.model.js';
import { FeedbackModel } from '../feedback/feedback.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { VisitQueueModel } from '../patients/visit-queue.model.js';
import { PrescriptionModel } from '../prescriptions/prescription.model.js';
import { UserModel } from '../users/user.model.js';
import type { AnalyticsQuery, DropoutQuery } from './analytics.schemas.js';

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const DAY_MS = 86_400_000;

function authFor(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localBounds(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00.000+05:30`),
    endExclusive: new Date(`${addDays(to, 1)}T00:00:00.000+05:30`),
  };
}

function clinicDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: INDIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function rate(numerator: number, denominator: number): number | null {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

async function effectiveDoctorId(req: Request, requested?: string): Promise<string | undefined> {
  const auth = authFor(req);
  if (auth.role === 'doctor') {
    if (requested && requested !== auth.userId) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
    return auth.userId;
  }
  if (requested && !await UserModel.exists({ _id: requested, clinicId: auth.clinicId, role: 'doctor' })) {
    throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
  }
  return requested;
}

function waitingMinutes(row: { checkedInAt?: Date | null; consultationStartedAt?: Date | null }): number | null {
  if (!row.checkedInAt || !row.consultationStartedAt) return null;
  const value = (row.consultationStartedAt.getTime() - row.checkedInAt.getTime()) / 60_000;
  return value >= 0 ? value : null;
}

export async function operations(req: Request, query: AnalyticsQuery) {
  const auth = authFor(req);
  const doctorId = await effectiveDoctorId(req, query.doctorId);
  const dateFilter = { $gte: query.from, $lte: query.to };
  const { start, endExclusive } = localBounds(query.from, query.to);
  const scope = { clinicId: auth.clinicId, ...(doctorId ? { doctorId } : {}) };
  const [queues, appointments, prescriptions, doctors, feedback, communications] = await Promise.all([
    VisitQueueModel.find({ ...scope, queueDate: dateFilter }).select('patientId doctorId queueDate status checkedInAt consultationStartedAt').lean(),
    AppointmentModel.find({ ...scope, scheduledAt: { $gte: start, $lt: endExclusive } }).select('doctorId status confirmationMessageId confirmationDeliveryStatus patientRepliedAt').lean(),
    PrescriptionModel.find({ ...scope, visitDate: { $gte: start, $lt: endExclusive } }).select('deliveryStatus').lean(),
    UserModel.find({ clinicId: auth.clinicId, role: 'doctor', ...(doctorId ? { _id: doctorId } : {}) }).select('name').sort({ name: 1 }).lean(),
    FeedbackModel.find({ ...scope, submittedAt: { $gte: start, $lt: endExclusive } }).select('rating').lean(),
    CommunicationMessageModel.find({ clinicId: auth.clinicId, createdAt: { $gte: start, $lt: endExclusive } }).select('direction purpose status patientId createdAt').lean(),
  ]);

  const volumeByDate = new Map<string, number>();
  for (const row of queues) volumeByDate.set(row.queueDate, (volumeByDate.get(row.queueDate) ?? 0) + 1);
  const dailyPatientVolume = [];
  for (let date = query.from; date <= query.to; date = addDays(date, 1)) dailyPatientVolume.push({ date, count: volumeByDate.get(date) ?? 0 });

  const waits = queues.map(waitingMinutes).filter((value): value is number => value !== null);
  const bucketDefinitions = [
    { key: 'under_15', label: 'Under 15 min', minMinutes: 0, maxMinutes: 14 },
    { key: '15_to_29', label: '15–29 min', minMinutes: 15, maxMinutes: 29 },
    { key: '30_to_59', label: '30–59 min', minMinutes: 30, maxMinutes: 59 },
    { key: '60_plus', label: '60+ min', minMinutes: 60, maxMinutes: null },
  ];
  const buckets = bucketDefinitions.map((bucket) => {
    const count = waits.filter((value) => value >= bucket.minMinutes && (bucket.maxMinutes === null || value < bucket.maxMinutes + 1)).length;
    return { ...bucket, count, percentage: rate(count, waits.length) };
  });

  const completed = queues.filter((row) => row.status === 'completed').length;
  const cancelled = queues.filter((row) => row.status === 'cancelled').length;
  const patientIds = [...new Set(queues.map((row) => String(row.patientId)))];
  const allVisits = patientIds.length ? await VisitQueueModel.find({ clinicId: auth.clinicId, patientId: { $in: patientIds }, checkedInAt: { $lt: endExclusive } }).select('patientId checkedInAt').sort({ checkedInAt: 1 }).lean() : [];
  const firstVisit = new Map<string, number>();
  for (const visit of allVisits) if (!firstVisit.has(String(visit.patientId))) firstVisit.set(String(visit.patientId), visit.checkedInAt.getTime());
  const returningVisits = queues.filter((row) => (firstVisit.get(String(row.patientId)) ?? row.checkedInAt.getTime()) < row.checkedInAt.getTime()).length;

  const doctorById = new Map(doctors.map((doctor) => [String(doctor._id), doctor.name]));
  const doctorWorkload = doctors.map((doctor) => {
    const rows = queues.filter((row) => String(row.doctorId) === String(doctor._id));
    const doctorWaits = rows.map(waitingMinutes).filter((value): value is number => value !== null);
    return {
      doctorId: String(doctor._id), doctorName: doctor.name, total: rows.length,
      completed: rows.filter((row) => row.status === 'completed').length,
      cancelled: rows.filter((row) => row.status === 'cancelled').length,
      averageWaitMinutes: doctorWaits.length ? Number((doctorWaits.reduce((sum, value) => sum + value, 0) / doctorWaits.length).toFixed(2)) : null,
    };
  }).filter((row) => doctorById.has(row.doctorId));

  const completedAppointments = appointments.filter((row) => row.status === 'completed').length;
  const noShows = appointments.filter((row) => row.status === 'no_show').length;
  const trackedAppointmentMessages = appointments.filter((row) => row.confirmationMessageId && row.confirmationDeliveryStatus && row.confirmationDeliveryStatus !== 'pending');
  const trackedPrescriptionMessages = prescriptions.filter((row) => row.deliveryStatus !== 'pending');
  const deliveredAppointmentMessages = trackedAppointmentMessages.filter((row) => ['delivered', 'read'].includes(row.confirmationDeliveryStatus ?? '')).length;
  const deliveredPrescriptionMessages = trackedPrescriptionMessages.filter((row) => ['delivered', 'read'].includes(row.deliveryStatus)).length;
  const trackedOutbound = communications.filter((row) => row.direction === 'outbound' && ['accepted', 'sent', 'delivered', 'read', 'failed', 'dead_letter'].includes(row.status));
  const deliveredOutbound = trackedOutbound.filter((row) => ['delivered', 'read'].includes(row.status)).length;
  const trackedAppointmentRequests = trackedOutbound.filter((row) => row.purpose.startsWith('appointment_'));
  const trackedReplies = communications.filter((row) => row.direction === 'inbound' && row.status === 'replied').length;
  const legacyAttempted = trackedAppointmentMessages.length + trackedPrescriptionMessages.length;
  const attempted = trackedOutbound.length || legacyAttempted;
  const deliveredOrRead = trackedOutbound.length ? deliveredOutbound : deliveredAppointmentMessages + deliveredPrescriptionMessages;
  const legacySentRequests = appointments.filter((row) => Boolean(row.confirmationMessageId));
  const requestsSent = trackedAppointmentRequests.length || legacySentRequests.length;
  const replied = trackedAppointmentRequests.length ? Math.min(trackedReplies, trackedAppointmentRequests.length) : legacySentRequests.filter((row) => Boolean(row.patientRepliedAt)).length;
  const ratings = feedback.map((row) => row.rating).filter((value): value is number => typeof value === 'number');

  const result = {
    filters: { from: query.from, to: query.to, doctorId: doctorId ?? null, timeZone: INDIA_TIME_ZONE },
    dailyPatientVolume,
    waitingTime: { sampleSize: waits.length, averageMinutes: waits.length ? Number((waits.reduce((sum, value) => sum + value, 0) / waits.length).toFixed(2)) : null, buckets },
    queue: {
      total: queues.length, completed, cancelled,
      waiting: queues.filter((row) => row.status === 'waiting').length,
      inConsultation: queues.filter((row) => row.status === 'in_consultation').length,
      completionRate: rate(completed, queues.length), cancellationRate: rate(cancelled, queues.length),
    },
    doctorWorkload,
    returningPatients: { returningVisits, totalVisits: queues.length, rate: rate(returningVisits, queues.length) },
    appointments: { completed: completedAppointments, noShows, eligibleTotal: completedAppointments + noShows, noShowRate: rate(noShows, completedAppointments + noShows) },
    messages: {
      delivery: { available: attempted > 0, attempted, deliveredOrRead, rate: rate(deliveredOrRead, attempted) },
      replies: { available: requestsSent > 0, requestsSent, replied, rate: rate(replied, requestsSent) },
      note: attempted || requestsSent ? 'Calculated only from persisted tracked message records.' : 'No tracked message records exist for this filter. No delivery or reply rate is inferred.',
    },
    feedback: { responses: ratings.length, averageRating: ratings.length ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2)) : null },
  };
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'analytics.operations_viewed', targetType: 'Analytics', metadata: { from: query.from, to: query.to, doctorScope: doctorId ? 'single' : 'clinic' } });
  return result;
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function operationsCsv(data: Awaited<ReturnType<typeof operations>>): string {
  const rows: Array<[string, string, string | number | null]> = [['metric', 'segment', 'value']];
  for (const day of data.dailyPatientVolume) rows.push(['daily_patient_volume', day.date, day.count]);
  rows.push(['waiting_time_minutes', 'average', data.waitingTime.averageMinutes]);
  for (const bucket of data.waitingTime.buckets) rows.push(['waiting_time_distribution', bucket.key, bucket.count]);
  for (const [key, value] of Object.entries(data.queue)) rows.push(['queue', key, value]);
  for (const doctor of data.doctorWorkload) {
    rows.push(['doctor_workload_total', doctor.doctorName, doctor.total]);
    rows.push(['doctor_workload_average_wait_minutes', doctor.doctorName, doctor.averageWaitMinutes]);
  }
  rows.push(['returning_patient_rate', 'percent', data.returningPatients.rate]);
  rows.push(['appointment_no_show_rate', 'percent', data.appointments.noShowRate]);
  rows.push(['message_delivery_rate', 'percent', data.messages.delivery.rate]);
  rows.push(['message_reply_rate', 'percent', data.messages.replies.rate]);
  rows.push(['feedback_average_rating', 'score_out_of_5', data.feedback.averageRating]);
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export async function recordOperationsExport(req: Request, query: AnalyticsQuery): Promise<void> {
  const auth = authFor(req);
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'analytics.operations_exported', targetType: 'AnalyticsExport', metadata: { from: query.from, to: query.to, doctorScope: query.doctorId ? 'single' : auth.role === 'doctor' ? 'self' : 'clinic', format: 'csv', privacy: 'aggregate_only' } });
}

export async function dropouts(req: Request, query: DropoutQuery) {
  const auth = authFor(req);
  const doctorId = await effectiveDoctorId(req, query.doctorId);
  const asOf = new Date(`${query.asOf}T00:00:00.000+05:30`);
  const patients = await PatientModel.find({
    clinicId: auth.clinicId, isDeleted: false, ...(doctorId ? { assignedDoctorId: doctorId } : {}),
    followupDueDate: { $lte: new Date(asOf.getTime() - 7 * DAY_MS) },
  }).select('name assignedDoctorId followupDueDate lastDropoutMessageSentAt dropoutReplied').lean();
  const data = patients.map((patient) => {
    const dueDate = clinicDate(patient.followupDueDate!);
    const dueStart = new Date(`${dueDate}T00:00:00.000+05:30`);
    const daysOverdue = Math.floor((asOf.getTime() - dueStart.getTime()) / DAY_MS);
    const threshold = daysOverdue >= 60 ? 60 : daysOverdue >= 30 ? 30 : daysOverdue >= 14 ? 14 : 7;
    return {
      patientId: String(patient._id), patientName: patient.name, doctorId: String(patient.assignedDoctorId),
      followupDueDate: dueDate, asOfDate: query.asOf, daysOverdue, status: `overdue_${threshold}`,
      rule: `Follow-up due date is ${daysOverdue} days overdue (${threshold}-day threshold).`,
      lastOutreachAt: patient.lastDropoutMessageSentAt ?? null, replied: patient.dropoutReplied,
    };
  }).sort((a, b) => b.daysOverdue - a.daysOverdue || a.patientName.localeCompare(b.patientName));
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'analytics.dropouts_viewed', targetType: 'DropoutRadar', metadata: { asOf: query.asOf, resultCount: data.length, doctorScope: doctorId ? 'single' : 'clinic' } });
  return data;
}
