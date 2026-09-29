/**
 * Jarvis Workflow Acceptance Test — Deterministic Fixtures
 *
 * Creates all test data defined in test.md §5.
 * All data is fully deterministic — no random values.
 * Two clinics, 3 patients Clinic A, 1 patient Clinic B, inventory, appointments.
 * CRITICAL: Uses reserved fake phone numbers only. Never real patient data.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

// Deterministic ObjectId helper
export function fixedId(label: string): string {
  return crypto
    .createHash('sha256')
    .update(`rxflow-jarvis-accept:${label}`)
    .digest('hex')
    .slice(0, 24);
}

export const FIXTURE_PASSWORD = 'AcceptTest!Jarvis2026';
const FIXTURE_HASH = bcrypt.hashSync(FIXTURE_PASSWORD, '$2b$12$012345678901234567890u');

// ────────────────────────────────────────────────────────
// IDs — fully deterministic
// ────────────────────────────────────────────────────────
export const ids = {
  // Clinic A
  clinicA: fixedId('clinic-a'),
  adminA: fixedId('admin-a'),
  doctorA: fixedId('doctor-a'),
  receptionA: fixedId('reception-a'),
  // Clinic B
  clinicB: fixedId('clinic-b'),
  doctorB: fixedId('doctor-b'),
  // Patients in Clinic A
  patient1: fixedId('patient-1'), // Priya Mehta
  patient2: fixedId('patient-2'), // Rahul Patil (38)
  patient3: fixedId('patient-3'), // Rahul Patil (52)
  // Patient in Clinic B
  patientB: fixedId('patient-b'), // Priya Mehta (Clinic B)
  // Queue entries in Clinic A
  queue1: fixedId('queue-1'), // Patient1 — in_consultation
  queue2: fixedId('queue-2'), // Patient2 — waiting
  queue3: fixedId('queue-3'), // Patient3 — waiting
  // Inventory items Clinic A
  inv1: fixedId('inventory-1'), // Paracetamol 500mg — available
  inv2: fixedId('inventory-2'), // Amoxicillin 500mg — low_stock
  inv3: fixedId('inventory-3'), // Cetirizine 10mg — out_of_stock
  // Appointment
  appt1: fixedId('appointment-1'), // future appointment for Patient1
} as const;

// ────────────────────────────────────────────────────────
// Clinic A document
// ────────────────────────────────────────────────────────
export const clinicADoc = {
  _id: ids.clinicA,
  name: 'Sunrise Test Clinic',
  email: 'admin-a@test.invalid',
  address: '1 Test Avenue, Acceptance Nagar',
  city: 'Vitest City',
  state: 'Test State',
  phone: '+910000000001',
  status: 'active',
  aiControls: { enabled: true, killSwitch: false },
  branding: { primaryColor: '#0f766e', accentColor: '#2563eb' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Clinic B document (tenant isolation)
// ────────────────────────────────────────────────────────
export const clinicBDoc = {
  _id: ids.clinicB,
  name: 'Moonlight Test Clinic',
  email: 'admin-b@test.invalid',
  address: '2 Isolation Road',
  city: 'Vitest City',
  state: 'Test State',
  phone: '+910000000002',
  status: 'active',
  aiControls: { enabled: true, killSwitch: false },
  branding: { primaryColor: '#1e3a5f', accentColor: '#4a90d9' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Users — Clinic A
// ────────────────────────────────────────────────────────
export const adminADoc = {
  _id: ids.adminA,
  clinicId: ids.clinicA,
  name: 'Admin Sunrise',
  email: 'admin-a@test.invalid',
  passwordHash: FIXTURE_HASH,
  role: 'admin',
  status: 'active',
  mustChangePassword: false,
  mfaRequired: false,
  mfaEnrolled: false,
  failedLoginCount: 0,
  sessionVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const doctorADoc = {
  _id: ids.doctorA,
  clinicId: ids.clinicA,
  name: 'Dr. Arjun Sharma',
  email: 'doctor-a@test.invalid',
  passwordHash: FIXTURE_HASH,
  role: 'doctor',
  status: 'active',
  mustChangePassword: false,
  mfaRequired: false,
  mfaEnrolled: false,
  failedLoginCount: 0,
  sessionVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const receptionADoc = {
  _id: ids.receptionA,
  clinicId: ids.clinicA,
  name: 'Receptionist Sunrise',
  email: 'reception-a@test.invalid',
  passwordHash: FIXTURE_HASH,
  role: 'receptionist',
  status: 'active',
  mustChangePassword: false,
  mfaRequired: false,
  mfaEnrolled: false,
  failedLoginCount: 0,
  sessionVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Users — Clinic B
// ────────────────────────────────────────────────────────
export const doctorBDoc = {
  _id: ids.doctorB,
  clinicId: ids.clinicB,
  name: 'Dr. Sunita Rao',
  email: 'doctor-b@test.invalid',
  passwordHash: FIXTURE_HASH,
  role: 'doctor',
  status: 'active',
  mustChangePassword: false,
  mfaRequired: false,
  mfaEnrolled: false,
  failedLoginCount: 0,
  sessionVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Patients — Clinic A
// ────────────────────────────────────────────────────────
export const patient1Doc = {
  _id: ids.patient1,
  clinicId: ids.clinicA,
  assignedDoctorId: ids.doctorA,
  registeredById: ids.receptionA,
  name: 'Priya Mehta',
  normalizedName: 'priya mehta',
  phone: '+910000001042',   // test.invalid phone — no real number
  age: 32,
  gender: 'female',
  chiefComplaint: 'Recurring headache',
  totalVisits: 2,
  isDeleted: false,
  dropoutStatus: 'active',
  dropoutReplied: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const patient2Doc = {
  _id: ids.patient2,
  clinicId: ids.clinicA,
  assignedDoctorId: ids.doctorA,
  registeredById: ids.receptionA,
  name: 'Rahul Patil',
  normalizedName: 'rahul patil',
  phone: '+910000001101',   // ends in 3210
  age: 38,
  gender: 'male',
  chiefComplaint: 'Back pain',
  totalVisits: 1,
  isDeleted: false,
  dropoutStatus: 'active',
  dropoutReplied: false,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

export const patient3Doc = {
  _id: ids.patient3,
  clinicId: ids.clinicA,
  assignedDoctorId: ids.doctorA,
  registeredById: ids.receptionA,
  name: 'Rahul Patil',
  normalizedName: 'rahul patil',
  phone: '+910000001102',   // ends in 7784
  age: 52,
  gender: 'male',
  chiefComplaint: 'Diabetes follow-up',
  totalVisits: 4,
  isDeleted: false,
  dropoutStatus: 'active',
  dropoutReplied: false,
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Patient — Clinic B (tenant isolation test)
// ────────────────────────────────────────────────────────
export const patientBDoc = {
  _id: ids.patientB,
  clinicId: ids.clinicB,
  assignedDoctorId: ids.doctorB,
  registeredById: ids.doctorB,
  name: 'Priya Mehta',
  normalizedName: 'priya mehta',
  phone: '+910000009001',
  age: 45,
  gender: 'female',
  chiefComplaint: 'Hypertension review',
  totalVisits: 6,
  isDeleted: false,
  dropoutStatus: 'active',
  dropoutReplied: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Queue entries — Clinic A (today's date for tests)
// ────────────────────────────────────────────────────────
export const TODAY = new Date().toISOString().slice(0, 10);

export const queue1Doc = {
  _id: ids.queue1,
  clinicId: ids.clinicA,
  patientId: ids.patient1,
  doctorId: ids.doctorA,
  checkedInById: ids.receptionA,
  queueDate: TODAY,
  queueNumber: 3,
  status: 'in_consultation',
  checkedInAt: new Date(),
  consultationStartedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const queue2Doc = {
  _id: ids.queue2,
  clinicId: ids.clinicA,
  patientId: ids.patient2,
  doctorId: ids.doctorA,
  checkedInById: ids.receptionA,
  queueDate: TODAY,
  queueNumber: 4,
  status: 'waiting',
  checkedInAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const queue3Doc = {
  _id: ids.queue3,
  clinicId: ids.clinicA,
  patientId: ids.patient3,
  doctorId: ids.doctorA,
  checkedInById: ids.receptionA,
  queueDate: TODAY,
  queueNumber: 5,
  status: 'waiting',
  checkedInAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────
// Inventory — Clinic A
// ────────────────────────────────────────────────────────
export const inv1Doc = {
  _id: ids.inv1,
  clinicId: ids.clinicA,
  name: 'Paracetamol',
  normalizedName: 'paracetamol',
  strength: '500 mg',
  dosageForm: 'tablet',
  stockQuantity: 120,
  reorderLevel: 30,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const inv2Doc = {
  _id: ids.inv2,
  clinicId: ids.clinicA,
  name: 'Amoxicillin',
  normalizedName: 'amoxicillin',
  strength: '500 mg',
  dosageForm: 'capsule',
  stockQuantity: 10,
  reorderLevel: 20,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

export const inv3Doc = {
  _id: ids.inv3,
  clinicId: ids.clinicA,
  name: 'Cetirizine',
  normalizedName: 'cetirizine',
  strength: '10 mg',
  dosageForm: 'tablet',
  stockQuantity: 0,
  reorderLevel: 10,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

// ────────────────────────────────────────────────────────
// Future appointment — Patient1
// ────────────────────────────────────────────────────────
const FUTURE_DATE = new Date(Date.now() + 86_400_000 * 2); // 2 days from now

export const appt1Doc = {
  _id: ids.appt1,
  clinicId: ids.clinicA,
  patientId: ids.patient1,
  doctorId: ids.doctorA,
  scheduledAt: FUTURE_DATE,
  durationMinutes: 15,
  status: 'confirmed',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────
// Additional Queue entry for N4 finalization test
// ────────────────────────────────────────────────────────
export const queue4Doc = {
  _id: fixedId('queue-4'),
  clinicId: ids.clinicA,
  patientId: ids.patient2,
  doctorId: ids.doctorA,
  checkedInById: ids.receptionA,
  queueDate: TODAY,
  queueNumber: 6,
  status: 'in_consultation',
  checkedInAt: new Date(),
  consultationStartedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────
// Seed helper — inserts all fixtures into the connected DB
// ────────────────────────────────────────────────────────
export async function seedAllFixtures() {
  const db = mongoose.connection.db!;

  // Upsert clinics
  await db.collection('clinics').updateOne(
    { _id: new mongoose.Types.ObjectId(ids.clinicA) },
    { $set: { ...clinicADoc, _id: new mongoose.Types.ObjectId(ids.clinicA) } },
    { upsert: true }
  );
  await db.collection('clinics').updateOne(
    { _id: new mongoose.Types.ObjectId(ids.clinicB) },
    { $set: { ...clinicBDoc, _id: new mongoose.Types.ObjectId(ids.clinicB) } },
    { upsert: true }
  );

  // Upsert users
  for (const doc of [adminADoc, doctorADoc, receptionADoc, doctorBDoc]) {
    await db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(doc._id) },
      { $set: { ...doc, _id: new mongoose.Types.ObjectId(doc._id), clinicId: new mongoose.Types.ObjectId(doc.clinicId) } },
      { upsert: true }
    );
  }

  // Upsert patients
  for (const [doc, clinicId] of [
    [patient1Doc, ids.clinicA],
    [patient2Doc, ids.clinicA],
    [patient3Doc, ids.clinicA],
    [patientBDoc, ids.clinicB],
  ] as const) {
    await db.collection('patients').updateOne(
      { _id: new mongoose.Types.ObjectId(doc._id) },
      { $set: { ...doc, _id: new mongoose.Types.ObjectId(doc._id), clinicId: new mongoose.Types.ObjectId(clinicId), assignedDoctorId: new mongoose.Types.ObjectId(doc.assignedDoctorId) } },
      { upsert: true }
    );
  }

  // Upsert queue entries
  for (const doc of [queue1Doc, queue2Doc, queue3Doc, queue4Doc]) {
    await db.collection('visitqueues').updateOne(
      { _id: new mongoose.Types.ObjectId(doc._id) },
      { $set: { ...doc, _id: new mongoose.Types.ObjectId(doc._id), clinicId: new mongoose.Types.ObjectId(doc.clinicId), patientId: new mongoose.Types.ObjectId(doc.patientId), doctorId: new mongoose.Types.ObjectId(doc.doctorId) } },
      { upsert: true }
    );
  }

  // Upsert inventory
  for (const doc of [inv1Doc, inv2Doc, inv3Doc]) {
    await db.collection('inventories').updateOne(
      { _id: new mongoose.Types.ObjectId(doc._id) },
      { $set: { ...doc, _id: new mongoose.Types.ObjectId(doc._id), clinicId: new mongoose.Types.ObjectId(doc.clinicId) } },
      { upsert: true }
    );
  }

  // Upsert appointment
  await db.collection('appointments').updateOne(
    { _id: new mongoose.Types.ObjectId(ids.appt1) },
    { $set: { ...appt1Doc, _id: new mongoose.Types.ObjectId(ids.appt1), clinicId: new mongoose.Types.ObjectId(appt1Doc.clinicId), patientId: new mongoose.Types.ObjectId(appt1Doc.patientId), doctorId: new mongoose.Types.ObjectId(appt1Doc.doctorId) } },
    { upsert: true }
  );
}

export async function cleanupAllFixtures() {
  const db = mongoose.connection.db!;
  const clinicIds = [new mongoose.Types.ObjectId(ids.clinicA), new mongoose.Types.ObjectId(ids.clinicB)];
  await db.collection('clinics').deleteMany({ _id: { $in: clinicIds } });
  await db.collection('users').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('patients').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('visitqueues').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('inventories').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('appointments').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('prescriptions').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('communicationmessages').deleteMany({ clinicId: { $in: clinicIds } });
  await db.collection('auditlogs').deleteMany({ clinicId: { $in: clinicIds } });
}
