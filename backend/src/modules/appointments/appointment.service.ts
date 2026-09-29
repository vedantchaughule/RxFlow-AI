import type { Request } from 'express';
import { AppError } from '../../shared/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { UserModel } from '../users/user.model.js';
import { AppointmentModel } from './appointment.model.js';
import type { AppointmentCreateInput, AppointmentListQuery, AppointmentSlotsQuery, AppointmentStatusInput } from './appointment.schemas.js';
import { cancelReferenceJobs, queueCommunicationSafely } from '../communications/communication.service.js';

const INDIA_TIME_ZONE = 'Asia/Kolkata';
const activeStatuses = ['confirmed', 'pending', 'rescheduled'] as const;

function authFor(req: Request) { if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required'); return req.auth; }
function datePart(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: INDIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function timePart(date: Date): number { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: INDIA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date); return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) * 60 + Number(parts.find((part) => part.type === 'minute')?.value ?? 0); }
function minutes(time: string): number { const [hour, minute] = time.split(':').map(Number); return (hour ?? 0) * 60 + (minute ?? 0); }
function dayBounds(date: string): { start: Date; end: Date } { return { start: new Date(`${date}T00:00:00.000+05:30`), end: new Date(`${date}T23:59:59.999+05:30`) }; }
function duplicate(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }

async function assertDoctor(clinicId: string, doctorId: string): Promise<void> {
  if (!await UserModel.exists({ _id: doctorId, clinicId, role: 'doctor', status: 'active' })) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
}
async function assertBoardDoctor(req: Request, doctorId?: string): Promise<string | undefined> {
  const auth = authFor(req);
  if (auth.role === 'doctor') {
    if (doctorId && doctorId !== auth.userId) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
    return auth.userId;
  }
  if (doctorId) await assertDoctor(auth.clinicId, doctorId);
  return doctorId;
}
async function assertWithinClinicHours(clinicId: string, scheduledAt: Date, durationMinutes: number): Promise<void> {
  const clinic = await ClinicModel.findById(clinicId).select('workingHours maxPatientsPerHour').lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  const start = timePart(scheduledAt); const end = start + durationMinutes;
  const hours = clinic.workingHours;
  if (start < minutes(hours.start) || end > minutes(hours.end) || (start < minutes(hours.breakEnd) && end > minutes(hours.breakStart))) throw new AppError(400, 'OUTSIDE_WORKING_HOURS', 'Appointment falls outside clinic working hours');
}

export async function createAppointment(req: Request, input: AppointmentCreateInput) {
  const auth = authFor(req);
  await Promise.all([assertDoctor(auth.clinicId, input.doctorId), assertWithinClinicHours(auth.clinicId, input.scheduledAt, input.durationMinutes)]);
  const patient = await PatientModel.findOne({ _id: input.patientId, clinicId: auth.clinicId, isDeleted: false }).select('_id name').lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  try {
    const appointment = await AppointmentModel.create({ clinicId: auth.clinicId, ...input, status: 'pending' });
    await PatientModel.updateOne({ _id: patient._id, clinicId: auth.clinicId, isDeleted: false }, { $set: { nextAppointmentId: appointment._id } });
    await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'appointment.created', targetType: 'Appointment', targetId: String(appointment._id), metadata: { doctorId: input.doctorId, scheduledAt: input.scheduledAt.toISOString(), durationMinutes: input.durationMinutes } });
    const appointmentTime = new Intl.DateTimeFormat('en-IN', { timeZone: INDIA_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' }).format(input.scheduledAt);
    const parameters = { patient_name: patient.name, appointment_time: appointmentTime };
    const planned = [
      { purpose: 'appointment_confirmation' as const, runAt: new Date() },
      { purpose: 'appointment_reminder_24h' as const, runAt: new Date(input.scheduledAt.getTime() - 24 * 60 * 60 * 1000) },
      { purpose: 'appointment_reminder_2h' as const, runAt: new Date(input.scheduledAt.getTime() - 2 * 60 * 60 * 1000) },
    ].filter((item) => item.purpose === 'appointment_confirmation' || item.runAt > new Date());
    const communications = [];
    for (const item of planned) communications.push(await queueCommunicationSafely({ clinicId: auth.clinicId, patientId: input.patientId, purpose: item.purpose, runAt: item.runAt, dedupeKey: `appointment:${appointment._id}:${item.purpose}`, referenceType: 'Appointment', referenceId: String(appointment._id), parameters }));
    return { ...appointment.toObject(), communications };
  } catch (error) { if (duplicate(error)) throw new AppError(409, 'DOUBLE_BOOKING', 'This doctor already has an appointment at that time'); throw error; }
}

export async function appointmentBoard(req: Request, query: AppointmentListQuery) {
  const auth = authFor(req); const doctorId = await assertBoardDoctor(req, query.doctorId); const date = query.date ?? datePart(new Date()); const bounds = dayBounds(date);
  const rows = await AppointmentModel.find({ clinicId: auth.clinicId, ...(doctorId ? { doctorId } : {}), ...(query.status ? { status: query.status } : {}), scheduledAt: { $gte: bounds.start, $lte: bounds.end } }).sort({ scheduledAt: 1 }).lean();
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'appointment.board_viewed', targetType: 'Appointment', metadata: { date, resultCount: rows.length } });
  return rows;
}

export async function availableSlots(req: Request, query: AppointmentSlotsQuery) {
  const auth = authFor(req); const doctorId = await assertBoardDoctor(req, query.doctorId); const effectiveDoctorId = doctorId ?? query.doctorId; const clinic = await ClinicModel.findById(auth.clinicId).select('workingHours').lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  const bounds = dayBounds(query.date); const booked = await AppointmentModel.find({ clinicId: auth.clinicId, doctorId: effectiveDoctorId, status: { $in: activeStatuses }, scheduledAt: { $gte: bounds.start, $lte: bounds.end } }).select('scheduledAt').lean();
  const bookedTimes = new Set(booked.map((appointment) => timePart(appointment.scheduledAt)));
  const available: string[] = []; const bookedLabels: string[] = [];
  for (let current = minutes(clinic.workingHours.start); current < minutes(clinic.workingHours.end); current += 15) {
    if (current >= minutes(clinic.workingHours.breakStart) && current < minutes(clinic.workingHours.breakEnd)) continue;
    const label = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`;
    (bookedTimes.has(current) ? bookedLabels : available).push(label);
  }
  return { available, booked: bookedLabels };
}

export async function updateAppointmentStatus(req: Request, appointmentId: string, input: AppointmentStatusInput) {
  const auth = authFor(req); const appointment = await AppointmentModel.findOne({ _id: appointmentId, clinicId: auth.clinicId });
  if (!appointment) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  if (auth.role === 'doctor' && String(appointment.doctorId) !== auth.userId) throw new AppError(404, 'NOT_FOUND', 'Appointment not found');
  if (!activeStatuses.includes(appointment.status as (typeof activeStatuses)[number])) throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'This appointment is already closed');
  appointment.status = input.status; await appointment.save();
  if (['cancelled', 'completed', 'no_show'].includes(input.status)) await PatientModel.updateOne({ _id: appointment.patientId, clinicId: auth.clinicId, nextAppointmentId: appointment._id }, { $unset: { nextAppointmentId: 1 } });
  if (['cancelled', 'completed', 'no_show'].includes(input.status)) await cancelReferenceJobs(auth.clinicId, appointmentId);
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'appointment.status_updated', targetType: 'Appointment', targetId: appointmentId, metadata: { status: input.status } });
  return appointment.toObject();
}
