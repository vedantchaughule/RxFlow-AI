import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import type { UserRole } from '../../src/modules/users/user.model.js';

export const FACTORY_PASSWORD = 'FactoryPassword!123';
export const FACTORY_NOW = new Date('2026-01-15T09:30:00.000Z');
const FACTORY_PASSWORD_HASH = bcrypt.hashSync(FACTORY_PASSWORD, '$2b$12$012345678901234567890u');
let sequence = 0;

type AnyRecord = Record<string, unknown>;

export function resetFactorySequence(): void {
  sequence = 0;
}

export function factoryId(label: string, ordinal = 1): Types.ObjectId {
  return new Types.ObjectId(crypto.createHash('sha256').update(`rxflow-test:${label}:${ordinal}`).digest('hex').slice(0, 24));
}

function nextOrdinal(): number {
  sequence += 1;
  return sequence;
}

export function buildClinic(overrides: AnyRecord = {}): AnyRecord {
  const ordinal = nextOrdinal();
  return {
    _id: factoryId('clinic', ordinal),
    name: `Factory Clinic ${ordinal}`,
    email: `clinic-${ordinal}@example.test`,
    address: '1 Integration Lane',
    city: 'Test City',
    state: 'Test State',
    phone: `+91000000${String(ordinal).padStart(4, '0')}`,
    status: 'active',
    createdAt: FACTORY_NOW,
    updatedAt: FACTORY_NOW,
    ...overrides,
  };
}

function buildUser(role: UserRole, overrides: AnyRecord = {}): AnyRecord {
  const ordinal = nextOrdinal();
  return {
    _id: factoryId(role, ordinal),
    clinicId: factoryId('clinic', 1),
    name: `Factory ${role} ${ordinal}`,
    email: `${role}-${ordinal}@example.test`,
    passwordHash: FACTORY_PASSWORD_HASH,
    role,
    status: 'active',
    mustChangePassword: role !== 'admin',
    failedLoginCount: 0,
    sessionVersion: 1,
    mfaRequired: false,
    mfaEnrolled: false,
    createdAt: FACTORY_NOW,
    updatedAt: FACTORY_NOW,
    ...overrides,
  };
}

export function buildAdmin(overrides: AnyRecord = {}): AnyRecord {
  return buildUser('admin', { mustChangePassword: false, ...overrides });
}

export function buildDoctor(overrides: AnyRecord = {}): AnyRecord {
  return buildUser('doctor', overrides);
}

export function buildReceptionist(overrides: AnyRecord = {}): AnyRecord {
  return buildUser('receptionist', overrides);
}

export function buildPatient(overrides: AnyRecord = {}): AnyRecord {
  const ordinal = nextOrdinal();
  return {
    _id: factoryId('patient', ordinal),
    clinicId: factoryId('clinic', 1),
    assignedDoctorId: factoryId('doctor', 3),
    registeredById: factoryId('receptionist', 4),
    name: `Factory Patient ${ordinal}`,
    normalizedName: `factory patient ${ordinal}`,
    phone: `+91900000${String(ordinal).padStart(4, '0')}`,
    age: 35,
    gender: 'other',
    chiefComplaint: 'Integration test complaint',
    totalVisits: 0,
    dropoutStatus: 'active',
    dropoutReplied: false,
    isDeleted: false,
    createdAt: FACTORY_NOW,
    updatedAt: FACTORY_NOW,
    ...overrides,
  };
}

export function buildQueueEntry(overrides: AnyRecord = {}): AnyRecord {
  const ordinal = nextOrdinal();
  return {
    _id: factoryId('queue', ordinal),
    clinicId: factoryId('clinic', 1),
    patientId: factoryId('patient', 5),
    doctorId: factoryId('doctor', 3),
    checkedInById: factoryId('receptionist', 4),
    queueDate: '2026-01-15',
    queueNumber: ordinal,
    status: 'in_consultation',
    checkedInAt: FACTORY_NOW,
    consultationStartedAt: FACTORY_NOW,
    createdAt: FACTORY_NOW,
    updatedAt: FACTORY_NOW,
    ...overrides,
  };
}

export function buildPrescription(overrides: AnyRecord = {}): AnyRecord {
  const ordinal = nextOrdinal();
  return {
    _id: factoryId('prescription', ordinal),
    clinicId: factoryId('clinic', 1),
    patientId: factoryId('patient', 5),
    doctorId: factoryId('doctor', 3),
    queueEntryId: factoryId('queue', 6),
    visitDate: FACTORY_NOW,
    diagnosis: 'Integration test diagnosis',
    doctorNotes: 'Non-clinical deterministic fixture text',
    medicines: [{
      name: 'Test medicine',
      dosage: '1 unit',
      frequency: 'Once',
      duration: '1 day',
      instructions: 'Fixture only',
    }],
    source: 'manual',
    clinicianConfirmedAt: FACTORY_NOW,
    deliveryStatus: 'pending',
    createdAt: FACTORY_NOW,
    updatedAt: FACTORY_NOW,
    ...overrides,
  };
}
