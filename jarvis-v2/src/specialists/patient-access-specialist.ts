import type { ToolExecutionContext } from '../tools/tool-interface.js';
import {
  createShowQrCommand,
  createDownloadQrCommand,
} from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';

export type ShareLinkRecord = {
  id: string;
  prescriptionId: string;
  patientId: string;
  clinicId: string;
  token: string;
  url: string;
  qrCodeDataUrl: string;
  status: 'active' | 'revoked' | 'expired';
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  lastViewedAt?: string | null;
  createdAt: string;
};

export type AccessStatusCard = {
  type: 'access_status';
  prescriptionId: string;
  shareLinkId?: string;
  hasActiveShareLink: boolean;
  expiresAt: string | null;
  viewCount: number;
  maxViews: number | null;
  isRevoked: boolean;
  lastViewedAt: string | null;
};

export type PatientAccessTurnResult = {
  success: boolean;
  assistantText: string;
  shareLink?: ShareLinkRecord;
  card?: AccessStatusCard;
  uiCommands?: UICommand[];
  error?: string;
  statusCode?: number;
};

export type PatientMobileViewPayload = {
  success: boolean;
  prescriptionId?: string;
  patientName?: string;
  clinicName?: string;
  doctorName?: string;
  pdfUrl?: string;
  canDownloadPdf?: boolean;
  viewCount?: number;
  error?: string;
  statusCode?: number;
  message?: string;
};

export class PatientAccessSpecialist {
  private readonly shareLinksDb = new Map<string, ShareLinkRecord>();

  public async generatePatientQr(
    prescriptionId: string,
    context: ToolExecutionContext,
    mockPatientName: string = 'Rahul Patil',
    mockShareLinkBackend?: (prescriptionId: string, ctx: ToolExecutionContext) => Promise<ShareLinkRecord>
  ): Promise<PatientAccessTurnResult> {
    try {
      let record: ShareLinkRecord;

      if (mockShareLinkBackend) {
        record = await mockShareLinkBackend(prescriptionId, context);
      } else {
        // Revoke any existing active share link for this prescription
        for (const [id, link] of this.shareLinksDb.entries()) {
          if (link.prescriptionId === prescriptionId && link.clinicId === context.clinicId && link.status === 'active') {
            link.status = 'revoked';
            this.shareLinksDb.set(id, link);
          }
        }

        const rawToken = `tok_${Math.random().toString(36).substring(2, 10)}${Date.now()}`;
        const patientAppBaseUrl = 'http://localhost:5174';
        const url = `${patientAppBaseUrl}/prescription/${rawToken}`;
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48h TTL

        record = {
          id: `sl_${Date.now()}`,
          prescriptionId,
          patientId: context.boundPatientId || 'pat_demo_123',
          clinicId: context.clinicId,
          token: rawToken,
          url,
          qrCodeDataUrl: `data:image/png;base64,mockQrCodeBase64Data_${rawToken}`,
          status: 'active',
          expiresAt,
          maxViews: 10,
          viewCount: 0,
          lastViewedAt: null,
          createdAt: new Date().toISOString(),
        };

        this.shareLinksDb.set(record.id, record);
        this.shareLinksDb.set(record.token, record); // Map token string for resolution
      }

      // Security check: Verify NO raw medical data is embedded in the QR URL
      const lowerUrl = record.url.toLowerCase();
      if (
        lowerUrl.includes('rahul') ||
        lowerUrl.includes('diagnosis') ||
        lowerUrl.includes('paracetamol') ||
        lowerUrl.includes('medicine')
      ) {
        throw new Error('SECURITY_VIOLATION: Raw medical data detected in QR payload URL');
      }

      const uiCommands: UICommand[] = [
        createShowQrCommand(prescriptionId, record.url, mockPatientName, record.id),
        createDownloadQrCommand(prescriptionId, record.qrCodeDataUrl, `RxFlow-QR-${record.id}.png`),
      ];

      return {
        success: true,
        assistantText: 'Patient prescription access QR code generated successfully.',
        shareLink: record,
        uiCommands,
      };
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      const errorCode = err.code || 'SHARE_LINK_GENERATION_FAILED';

      return {
        success: false,
        assistantText: `Failed to generate patient access QR: ${err.message}`,
        error: errorCode,
        statusCode,
      };
    }
  }

  public async revokeShareLink(
    prescriptionId: string,
    shareLinkId: string | undefined,
    context: ToolExecutionContext
  ): Promise<PatientAccessTurnResult> {
    let targetLink: ShareLinkRecord | undefined;

    if (shareLinkId && this.shareLinksDb.has(shareLinkId)) {
      targetLink = this.shareLinksDb.get(shareLinkId);
    } else {
      for (const link of this.shareLinksDb.values()) {
        if (link.prescriptionId === prescriptionId && link.clinicId === context.clinicId && link.status === 'active') {
          targetLink = link;
          break;
        }
      }
    }

    if (!targetLink) {
      return {
        success: false,
        assistantText: 'No active share link found to revoke for this prescription.',
        error: 'SHARE_LINK_NOT_FOUND',
        statusCode: 404,
      };
    }

    targetLink.status = 'revoked';
    this.shareLinksDb.set(targetLink.id, targetLink);
    this.shareLinksDb.set(targetLink.token, targetLink);

    return {
      success: true,
      assistantText: 'Prescription patient access link has been revoked.',
      shareLink: targetLink,
    };
  }

  public async generateReplacementAccess(
    prescriptionId: string,
    context: ToolExecutionContext,
    patientName: string = 'Rahul Patil'
  ): Promise<PatientAccessTurnResult> {
    // 1. Revoke existing active links
    await this.revokeShareLink(prescriptionId, undefined, context);

    // 2. Issue new replacement link
    const res = await this.generatePatientQr(prescriptionId, context, patientName);
    if (res.success) {
      res.assistantText = 'Previous patient access revoked and fresh replacement QR code generated.';
    }
    return res;
  }

  public async getAccessStatus(
    prescriptionId: string,
    context: ToolExecutionContext
  ): Promise<PatientAccessTurnResult> {
    let activeLink: ShareLinkRecord | undefined;

    for (const link of this.shareLinksDb.values()) {
      if (link.prescriptionId === prescriptionId && link.clinicId === context.clinicId) {
        if (!activeLink || new Date(link.createdAt) > new Date(activeLink.createdAt)) {
          activeLink = link;
        }
      }
    }

    if (!activeLink) {
      return {
        success: true,
        assistantText: 'No patient access link has been created for this prescription yet.',
        card: {
          type: 'access_status',
          prescriptionId,
          hasActiveShareLink: false,
          expiresAt: null,
          viewCount: 0,
          maxViews: null,
          isRevoked: false,
          lastViewedAt: null,
        },
      };
    }

    const isExpired = new Date() > new Date(activeLink.expiresAt);
    const isRevoked = activeLink.status === 'revoked';

    return {
      success: true,
      assistantText: `Prescription share link status: ${activeLink.status.toUpperCase()} (${activeLink.viewCount}/${activeLink.maxViews} views used).`,
      shareLink: activeLink,
      card: {
        type: 'access_status',
        prescriptionId,
        shareLinkId: activeLink.id,
        hasActiveShareLink: activeLink.status === 'active' && !isExpired,
        expiresAt: activeLink.expiresAt,
        viewCount: activeLink.viewCount,
        maxViews: activeLink.maxViews,
        isRevoked,
        lastViewedAt: activeLink.lastViewedAt || null,
      },
    };
  }

  public resolvePatientAccess(rawToken: string, nowOverride?: Date): PatientMobileViewPayload {
    const record = this.shareLinksDb.get(rawToken);

    // 1. Invalid or non-existent token
    if (!record) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        statusCode: 404,
        message: 'Invalid or expired prescription share link.',
      };
    }

    // 2. Revoked token
    if (record.status === 'revoked') {
      return {
        success: false,
        error: 'LINK_REVOKED',
        statusCode: 410,
        message: 'This prescription share link has been revoked by the doctor.',
      };
    }

    // 3. Expired token
    const now = nowOverride || new Date();
    if (now > new Date(record.expiresAt)) {
      record.status = 'expired';
      return {
        success: false,
        error: 'TOKEN_EXPIRED',
        statusCode: 410,
        message: 'This prescription share link has expired.',
      };
    }

    // 4. View limit exceeded
    if (record.viewCount >= record.maxViews) {
      return {
        success: false,
        error: 'MAX_VIEWS_EXCEEDED',
        statusCode: 410,
        message: 'Maximum view limit reached for this share link.',
      };
    }

    // Record valid view
    record.viewCount += 1;
    record.lastViewedAt = now.toISOString();

    return {
      success: true,
      prescriptionId: record.prescriptionId,
      patientName: 'Rahul Patil',
      clinicName: 'HealthCare Clinic',
      doctorName: 'Dr. Practitioner',
      pdfUrl: `/api/v1/public/prescriptions/${rawToken}/pdf`,
      canDownloadPdf: true,
      viewCount: record.viewCount,
    };
  }
}
