import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  buildAdmin,
  buildClinic,
  buildDoctor,
  buildPatient,
  buildPrescription,
  buildQueueEntry,
  buildReceptionist,
  FACTORY_NOW,
  resetFactorySequence,
} from './support/factories.js';

const port = Number(process.env.RXFLOW_E2E_BACKEND_PORT ?? 5050);
const frontendOrigin = process.env.RXFLOW_E2E_FRONTEND_ORIGIN ?? 'http://127.0.0.1:5190';
const replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
process.env.NODE_ENV = 'test';
process.env.PORT = String(port);
process.env.MONGODB_URI = replicaSet.getUri('rxflow_test_e2e');
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-that-is-at-least-sixty-four-characters-long-for-validation';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-that-is-at-least-sixty-four-characters-long-for-validation';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CLIENT_URL = frontendOrigin;
process.env.CORS_ORIGINS = frontendOrigin;
process.env.COOKIE_SECURE = 'false';
process.env.PLATFORM_SUPPORT_KEY = 'e2e-platform-support-key-that-is-long-enough';

const [{ default: mongoose }, { createApp }, { ClinicModel }, { UserModel }, { PatientModel }, queueModels, { PrescriptionModel }, { PasswordResetTokenModel }] = await Promise.all([
  import('mongoose'),
  import('../src/app.js'),
  import('../src/modules/clinics/clinic.model.js'),
  import('../src/modules/users/user.model.js'),
  import('../src/modules/patients/patient.model.js'),
  import('../src/modules/patients/visit-queue.model.js'),
  import('../src/modules/prescriptions/prescription.model.js'),
  import('../src/modules/auth/password-reset-token.model.js'),
]);
const { VisitQueueModel, QueueCounterModel } = queueModels;

await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([
  ClinicModel.syncIndexes(),
  UserModel.syncIndexes(),
  PatientModel.syncIndexes(),
  VisitQueueModel.syncIndexes(),
  QueueCounterModel.syncIndexes(),
  PrescriptionModel.syncIndexes(),
  PasswordResetTokenModel.syncIndexes(),
]);

resetFactorySequence();
const clinic = buildClinic();
const admin = buildAdmin({ clinicId: clinic._id, mustChangePassword: false });
const doctor = buildDoctor({ clinicId: clinic._id, mustChangePassword: false });
const receptionist = buildReceptionist({ clinicId: clinic._id, mustChangePassword: false });
const patient = buildPatient({ clinicId: clinic._id, assignedDoctorId: doctor._id, registeredById: receptionist._id });
const queue = buildQueueEntry({ clinicId: clinic._id, patientId: patient._id, doctorId: doctor._id, checkedInById: receptionist._id, queueDate: new Date().toISOString().slice(0, 10) });
const prescription = buildPrescription({ clinicId: clinic._id, patientId: patient._id, doctorId: doctor._id, queueEntryId: queue._id });
const temporaryReceptionist = buildReceptionist({ clinicId: clinic._id, mustChangePassword: true });
const qrToken = 'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr';
const [{ encrypt }, { hashIdentifier }] = await Promise.all([
  import('../src/shared/encryption.js'),
  import('../src/shared/security.js'),
]);
const returningPatient = buildPatient({
  _id: new mongoose.Types.ObjectId('000000000000000000000010'),
  clinicId: clinic._id,
  assignedDoctorId: doctor._id,
  registeredById: receptionist._id,
  name: 'Returning Patient',
  normalizedName: 'returning patient',
  phone: '+919000000010',
  totalVisits: 2,
  lastVisitDate: FACTORY_NOW,
  qrTokenHash: hashIdentifier(qrToken),
  qrTokenEncrypted: encrypt(qrToken),
  qrIssuedAt: FACTORY_NOW,
});

await ClinicModel.create(clinic);
await UserModel.insertMany([admin, doctor, receptionist, temporaryReceptionist]);
await PatientModel.insertMany([patient, returningPatient]);
await VisitQueueModel.create(queue);
await PrescriptionModel.create(prescription);

const server = createApp().listen(port, '127.0.0.1');
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
  await replicaSet.stop();
}
process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
