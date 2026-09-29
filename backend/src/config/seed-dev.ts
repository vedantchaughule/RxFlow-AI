import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { ClinicModel } from '../modules/clinics/clinic.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { PatientModel } from '../modules/patients/patient.model.js';
import { VisitQueueModel, QueueCounterModel } from '../modules/patients/visit-queue.model.js';
import { InventoryMedicineModel } from '../modules/inventory/inventory.model.js';
import { PrescriptionModel } from '../modules/prescriptions/prescription.model.js';
import { createPatientQrMaterial } from '../modules/patients/patient-qr.service.js';

export const DEMO_PASSWORD = 'FactoryPassword!123';

export async function seedDevelopmentData(): Promise<void> {
  const existingClinic = await ClinicModel.findOne();
  if (existingClinic) {
    return;
  }

  console.log('[Seed] Seeding initial demonstration clinic and accounts...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const clinicId = new Types.ObjectId();
  const doctorId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const receptionistId = new Types.ObjectId();

  const { encrypt } = await import('../shared/encryption.js');
  const geminiKey = process.env.GEMINI_API_KEY || 'demo-gemini-key-placeholder';

  await ClinicModel.create({
    _id: clinicId,
    name: 'RxFlow Demonstration Clinic',
    email: 'clinic@example.test',
    address: '42 Medical Boulevard, Bandra West',
    city: 'Mumbai',
    state: 'Maharashtra',
    phone: '+919876543210',
    status: 'active',
    aiConfig: {
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelName: 'gemini-2.5-flash',
      encryptedApiKey: encrypt(geminiKey),
      isConfigured: true,
      enabled: true,
      killSwitch: false,
      timeoutMs: 15000,
      maxContextVisits: 5,
    },
  });

  await UserModel.insertMany([
    {
      _id: doctorId,
      clinicId,
      email: 'doctor@example.test',
      name: 'Dr. Siddharth Mehta',
      role: 'doctor',
      passwordHash,
      status: 'active',
      mustChangePassword: false,
      sessionVersion: 1,
    },
    {
      _id: new Types.ObjectId(),
      clinicId,
      email: 'chaughule.vedant06@gmail.com',
      name: 'Dr. Vedant Chaughule',
      role: 'doctor',
      passwordHash,
      status: 'active',
      mustChangePassword: false,
      sessionVersion: 1,
    },
    {
      _id: adminId,
      clinicId,
      email: 'admin@example.test',
      name: 'Admin Officer',
      role: 'admin',
      passwordHash,
      status: 'active',
      mustChangePassword: false,
      sessionVersion: 1,
    },
    {
      _id: receptionistId,
      clinicId,
      email: 'receptionist@example.test',
      name: 'Priya Sharma',
      role: 'receptionist',
      passwordHash,
      status: 'active',
      mustChangePassword: false,
      sessionVersion: 1,
    },
  ]);

  const p1Id = new Types.ObjectId();
  const p2Id = new Types.ObjectId();
  const p3Id = new Types.ObjectId();

  const qr1 = createPatientQrMaterial();
  const qr2 = createPatientQrMaterial();
  const qr3 = createPatientQrMaterial();

  await PatientModel.insertMany([
    {
      _id: p1Id,
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: receptionistId,
      name: 'Riya Sharma',
      normalizedName: 'riya sharma',
      phone: '+919876500001',
      age: 28,
      gender: 'female',
      bloodGroup: 'B+',
      chiefComplaint: 'Mild dry cough and seasonal allergies for 3 days',
      communicationConsent: { status: 'opted_in', source: 'in_person', categories: ['appointments', 'prescription_ready'] },
      totalVisits: 1,
      lastVisitDate: new Date(),
      qrTokenHash: qr1.tokenHash,
      qrTokenEncrypted: qr1.tokenEncrypted,
      qrIssuedAt: qr1.issuedAt,
    },
    {
      _id: p2Id,
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: receptionistId,
      name: 'Vikram Patel',
      normalizedName: 'vikram patel',
      phone: '+919876500002',
      age: 45,
      gender: 'male',
      bloodGroup: 'O+',
      chiefComplaint: 'Routine blood pressure follow-up and renewal',
      communicationConsent: { status: 'opted_in', source: 'in_person', categories: ['appointments', 'prescription_ready'] },
      totalVisits: 3,
      lastVisitDate: new Date(),
      qrTokenHash: qr2.tokenHash,
      qrTokenEncrypted: qr2.tokenEncrypted,
      qrIssuedAt: qr2.issuedAt,
    },
    {
      _id: p3Id,
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: receptionistId,
      name: 'Meera Kapoor',
      normalizedName: 'meera kapoor',
      phone: '+919876500003',
      age: 34,
      gender: 'female',
      bloodGroup: 'A+',
      chiefComplaint: 'Acute migraine and sensitivity to bright light',
      communicationConsent: { status: 'opted_in', source: 'in_person', categories: ['appointments', 'prescription_ready'] },
      totalVisits: 1,
      lastVisitDate: new Date(),
      qrTokenHash: qr3.tokenHash,
      qrTokenEncrypted: qr3.tokenEncrypted,
      qrIssuedAt: qr3.issuedAt,
    },
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const q1Id = new Types.ObjectId();
  const q2Id = new Types.ObjectId();
  const q3Id = new Types.ObjectId();

  await VisitQueueModel.insertMany([
    {
      _id: q1Id,
      clinicId,
      patientId: p1Id,
      doctorId,
      checkedInById: receptionistId,
      queueDate: todayStr,
      queueNumber: 1,
      status: 'in_consultation',
      checkedInAt: new Date(Date.now() - 30 * 60 * 1000),
      consultationStartedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    {
      _id: q2Id,
      clinicId,
      patientId: p2Id,
      doctorId,
      checkedInById: receptionistId,
      queueDate: todayStr,
      queueNumber: 2,
      status: 'waiting',
      checkedInAt: new Date(Date.now() - 15 * 60 * 1000),
    },
    {
      _id: q3Id,
      clinicId,
      patientId: p3Id,
      doctorId,
      checkedInById: receptionistId,
      queueDate: todayStr,
      queueNumber: 3,
      status: 'waiting',
      checkedInAt: new Date(Date.now() - 5 * 60 * 1000),
    },
  ]);

  await QueueCounterModel.create({
    _id: `${String(clinicId)}:${String(doctorId)}:${todayStr}`,
    sequence: 3,
  });

  const prevQueueId = new Types.ObjectId();
  await PrescriptionModel.create({
    clinicId,
    patientId: p1Id,
    doctorId,
    queueEntryId: prevQueueId,
    visitDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    diagnosis: 'Seasonal allergic rhinitis',
    doctorNotes: 'Advised warm water steam inhalation and hydration.',
    medicines: [
      {
        name: 'Cetirizine 10mg',
        dosage: '1 tablet',
        frequency: 'Once daily at bedtime',
        duration: '5 days',
        instructions: 'Take after dinner',
      },
      {
        name: 'Paracetamol 500mg',
        dosage: '1 tablet',
        frequency: 'SOS (as needed)',
        duration: '3 days',
        instructions: 'Take with food if fever or body ache',
      },
    ],
    source: 'manual',
    clinicianConfirmedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    deliveryStatus: 'delivered',
  });

  const meds = [
    { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', dosageForm: 'Tablet', strength: '500mg', stockQuantity: 250, reorderLevel: 50 },
    { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', dosageForm: 'Capsule', strength: '500mg', stockQuantity: 120, reorderLevel: 30 },
    { name: 'Cetirizine 10mg', genericName: 'Cetirizine Hydrochloride', dosageForm: 'Tablet', strength: '10mg', stockQuantity: 80, reorderLevel: 20 },
    { name: 'Metformin 500mg', genericName: 'Metformin', dosageForm: 'Tablet', strength: '500mg', stockQuantity: 15, reorderLevel: 25 },
    { name: 'Azithromycin 500mg', genericName: 'Azithromycin', dosageForm: 'Tablet', strength: '500mg', stockQuantity: 40, reorderLevel: 10 },
    { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole Sodium', dosageForm: 'Tablet', strength: '40mg', stockQuantity: 100, reorderLevel: 20 },
  ];

  await InventoryMedicineModel.insertMany(
    meds.map((m) => ({
      clinicId,
      name: m.name,
      normalizedName: m.name.toLowerCase().trim(),
      genericName: m.genericName,
      dosageForm: m.dosageForm,
      strength: m.strength,
      stockQuantity: m.stockQuantity,
      reorderLevel: m.reorderLevel,
      unit: 'tablets',
      isActive: true,
      createdById: doctorId,
      updatedById: doctorId,
    }))
  );

  console.log('[Seed] Demonstration data seeded successfully!');
  console.log('       Doctor Login:       chaughule.vedant06@gmail.com / FactoryPassword!123');
  console.log('       Doctor Login (alt): doctor@example.test          / FactoryPassword!123');
  console.log('       Admin Login:        admin@example.test           / FactoryPassword!123');
  console.log('       Receptionist Login: receptionist@example.test    / FactoryPassword!123');
}
