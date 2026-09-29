import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const artifactsDir = 'C:/Users/chaug/.gemini/antigravity-ide/brain/d097ea29-c448-44c2-b0aa-ee8e661d4ccf';
const publicDir = 'c:/Users/chaug/Downloads/RxFlow_AI_Repaired_With_Working_Jarvis/patient-mobile/public';
const localIp = '192.168.1.43';
const mobileBaseUrl = `http://${localIp}:5174`;

function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function main() {
  console.log('Generating QR Codes for Patient Mobile Portal...\n');

  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. Home Page QR
  const homeUrl = `${mobileBaseUrl}/`;
  const homeQrPath = path.join(artifactsDir, 'patient_mobile_home_qr.png');
  const homePublicQrPath = path.join(publicDir, 'portal-home-qr.png');
  await QRCode.toFile(homeQrPath, homeUrl, { errorCorrectionLevel: 'H', margin: 2, width: 500, color: { dark: '#0f172a', light: '#ffffff' } });
  await QRCode.toFile(homePublicQrPath, homeUrl, { errorCorrectionLevel: 'H', margin: 2, width: 500, color: { dark: '#0f172a', light: '#ffffff' } });
  console.log(`✓ Saved Home QR Code PNG to artifacts and public/portal-home-qr.png`);

  // 2. Scan Page QR
  const scanUrl = `${mobileBaseUrl}/scan`;
  const scanQrPath = path.join(artifactsDir, 'patient_mobile_scan_qr.png');
  const scanPublicQrPath = path.join(publicDir, 'scan-qr.png');
  await QRCode.toFile(scanQrPath, scanUrl, { errorCorrectionLevel: 'H', margin: 2, width: 500, color: { dark: '#0d9488', light: '#ffffff' } });
  await QRCode.toFile(scanPublicQrPath, scanUrl, { errorCorrectionLevel: 'H', margin: 2, width: 500, color: { dark: '#0d9488', light: '#ffffff' } });
  console.log(`✓ Saved Scan QR Code PNG to artifacts and public/scan-qr.png`);

  // 3. Sample Prescription Share Link QR
  const sampleToken = generateRawToken();
  const samplePrescriptionUrl = `${mobileBaseUrl}/prescription/${sampleToken}`;
  const rxQrPath = path.join(artifactsDir, 'patient_mobile_prescription_qr.png');
  const rxPublicQrPath = path.join(publicDir, 'sample-prescription-qr.png');
  await QRCode.toFile(rxQrPath, samplePrescriptionUrl, { errorCorrectionLevel: 'H', margin: 2, width: 500, color: { dark: '#2563eb', light: '#ffffff' } });
  await QRCode.toFile(rxPublicQrPath, samplePrescriptionUrl, { errorCorrectionLevel: 'H', margin: 2, width: 500, color: { dark: '#2563eb', light: '#ffffff' } });
  console.log(`✓ Saved Prescription QR Code PNG to artifacts and public/sample-prescription-qr.png`);
}

main().catch(console.error);
