import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ClinicLogoModel } from '../clinics/clinic-logo.model.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { createPatientQrMaterial, patientQrValue } from '../patients/patient-qr.service.js';
import { UserModel } from '../users/user.model.js';
import { decrypt } from '../../shared/encryption.js';
import { AppError } from '../../shared/errors.js';
import { PrescriptionModel } from './prescription.model.js';

type PdfMedicine = { name: string; dosage: string; frequency: string; duration: string; instructions?: string };

function safeBrandColor(value: string | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#0f766e';
}

function printableDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date);
}

function pdfBuffer(render: (document: PDFKit.PDFDocument) => Promise<void>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48, compress: false, info: { Title: 'RxFlow prescription', Author: 'RxFlow AI' } });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    void render(document).then(() => document.end(), reject);
  });
}

export async function createPrescriptionPdf(clinicId: string, prescriptionId: string): Promise<Buffer> {
  const prescription = await PrescriptionModel.findOne({ _id: prescriptionId, clinicId }).lean();
  if (!prescription) throw new AppError(404, 'NOT_FOUND', 'Prescription not found');

  const [clinic, patient, doctor, logo] = await Promise.all([
    ClinicModel.findOne({ _id: clinicId, status: 'active' }).lean(),
    PatientModel.findOne({ _id: prescription.patientId, clinicId, isDeleted: false }).select('+qrTokenEncrypted').lean(),
    UserModel.findOne({ _id: prescription.doctorId, clinicId, role: 'doctor', status: 'active' }).lean(),
    ClinicLogoModel.findOne({ clinicId }).select('+data').lean(),
  ]);
  if (!clinic || !patient || !doctor) throw new AppError(404, 'NOT_FOUND', 'Prescription document data not found');

  let qrTokenEncrypted = patient.qrTokenEncrypted;
  if (!qrTokenEncrypted) {
    const qrMaterial = createPatientQrMaterial();
    await PatientModel.updateOne(
      { _id: patient._id, clinicId, isDeleted: false },
      { $set: { qrTokenHash: qrMaterial.tokenHash, qrTokenEncrypted: qrMaterial.tokenEncrypted, qrIssuedAt: qrMaterial.issuedAt } },
    );
    qrTokenEncrypted = qrMaterial.tokenEncrypted;
  }

  const verificationLink = patientQrValue(decrypt(qrTokenEncrypted));
  const verificationQr = await QRCode.toBuffer(verificationLink, { type: 'png', width: 120, margin: 1, errorCorrectionLevel: 'H' });

  const medicines = prescription.medicines as PdfMedicine[];
  const primary = safeBrandColor(clinic.branding?.primaryColor);
  const accent = safeBrandColor(clinic.branding?.accentColor);

  return pdfBuffer(async (document) => {
    document.rect(0, 0, document.page.width, 18).fill(primary);
    let headerLeft = 48;
    if (logo && (logo.contentType === 'image/png' || logo.contentType === 'image/jpeg')) {
      try {
        document.image(Buffer.from(logo.data), 48, 34, { fit: [62, 62], align: 'center', valign: 'center' });
        headerLeft = 122;
      } catch {
        // A malformed legacy logo must not prevent an authorised clinician from printing a final record.
      }
    }
    document.fillColor(primary).font('Helvetica-Bold').fontSize(20).text(clinic.name, headerLeft, 40, { width: 300 });
    const clinicDetails = [clinic.registrationNumber ? `Registration: ${clinic.registrationNumber}` : '', clinic.address, [clinic.city, clinic.state].filter(Boolean).join(', '), clinic.phone].filter(Boolean).join('\n');
    document.fillColor('#374151').font('Helvetica').fontSize(9).text(clinicDetails, headerLeft, 66, { width: 300 });
    document.fillColor(accent).font('Helvetica-Bold').fontSize(14).text('PRESCRIPTION', 415, 45, { width: 132, align: 'right' });
    document.fillColor('#4b5563').font('Helvetica').fontSize(8).text(`Issued ${printableDate(prescription.visitDate)}`, 385, 66, { width: 162, align: 'right' });

    document.moveTo(48, 116).lineTo(547, 116).strokeColor('#d1d5db').stroke();
    document.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Patient', 48, 132);
    document.font('Helvetica').fontSize(10).text(`${patient.name}  |  ${patient.age} years  |  ${patient.gender}`, 48, 150);
    document.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Treating doctor', 330, 132);
    document.font('Helvetica').fontSize(10).text(doctor.name, 330, 150, { width: 217 });

    document.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Diagnosis', 48, 190);
    document.font('Helvetica').fontSize(10).text(prescription.diagnosis, 48, 208, { width: 499 });
    let y = Math.max(252, document.y + 20);
    document.fillColor(primary).rect(48, y, 499, 24).fill();
    document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    document.text('Medicine', 58, y + 8, { width: 155 });
    document.text('Dose and frequency', 218, y + 8, { width: 155 });
    document.text('Duration and instructions', 378, y + 8, { width: 159 });
    y += 24;
    for (const medicine of medicines) {
      const rowStart = y;
      const rowHeight = 50;
      if (y + rowHeight > 675) {
        document.addPage();
        y = 58;
      }
      document.fillColor('#f8fafc').rect(48, y, 499, rowHeight).fill();
      document.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text(medicine.name, 58, y + 8, { width: 150 });
      document.font('Helvetica').fontSize(8).text(`${medicine.dosage}\n${medicine.frequency}`, 218, y + 8, { width: 150 });
      document.text(`${medicine.duration}${medicine.instructions ? `\n${medicine.instructions}` : ''}`, 378, y + 8, { width: 159 });
      y = rowStart + rowHeight + 4;
    }
    if (prescription.doctorNotes) {
      if (y + 72 > 675) { document.addPage(); y = 58; }
      document.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Doctor notes', 48, y + 10);
      document.font('Helvetica').fontSize(9).text(prescription.doctorNotes, 48, y + 28, { width: 340 });
    }

    const verifyY = Math.min(Math.max(y + 18, 555), 650);
    document.image(verificationQr, 420, verifyY - 10, { width: 88 });
    document.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text('Verify patient identity', 48, verifyY);
    document.font('Helvetica').fontSize(8).fillColor('#4b5563').text('Scan the QR code using an authenticated RxFlow clinic account. The QR code contains an opaque token only.', 48, verifyY + 16, { width: 350 });
    document.fillColor('#6b7280').font('Helvetica').fontSize(7).text('This is a final clinician-confirmed record. It cannot be silently edited. Delivery status is pending until confirmed by an external provider.', 48, 770, { width: 499, align: 'center' });
  });
}
