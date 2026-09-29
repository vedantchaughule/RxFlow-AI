import { env } from '../config/env.js';

export const TWILIO_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TemplateKind = 'confirmation' | 'reminder' | 'cancelled';

export interface OutboundMessageRequest {
  to: string;
  from?: string;
  body?: string;
  templateKind?: TemplateKind;
  contentVariables?: Record<string, string>;
  lastPatientMessageAt?: Date | string | number;
}

export interface PreparedOutboundPayload {
  to: string;
  from: string;
  messageType: 'in_session' | 'business_initiated_template';
  body?: string;
  contentSid?: string;
  contentVariables?: string;
}

/**
 * Checks if the patient's last inbound message is within the 24-hour customer service window.
 */
export function isWithin24HourWindow(lastPatientMessageAt?: Date | string | number): boolean {
  if (!lastPatientMessageAt) return false;
  const lastTime = new Date(lastPatientMessageAt).getTime();
  if (isNaN(lastTime)) return false;
  return Date.now() - lastTime < TWILIO_24H_WINDOW_MS;
}

/**
 * Resolves the Content SID for a specific template type from environment configuration.
 * Prevents hardcoding Content SIDs in application code.
 */
export function getContentSidForTemplate(kind: TemplateKind): string {
  switch (kind) {
    case 'confirmation':
      return env.TWILIO_APPOINTMENT_CONFIRMATION_CONTENT_SID;
    case 'reminder':
      return env.TWILIO_APPOINTMENT_REMINDER_CONTENT_SID;
    case 'cancelled':
      return env.TWILIO_APPOINTMENT_CANCELLED_CONTENT_SID;
    default:
      throw new Error(`Unsupported template kind: ${kind}`);
  }
}

/**
 * Prepares an outbound message payload adhering strictly to Meta 24-hour WhatsApp rules:
 * - Within 24 hours: Sends normal conversational in-session text message.
 * - Outside 24 hours: Requires an approved WhatsApp Content Template SID and JSON content variables.
 */
export function prepareOutboundMessage(req: OutboundMessageRequest): PreparedOutboundPayload {
  const from = req.from || env.TWILIO_WHATSAPP_FROM;
  const inWindow = isWithin24HourWindow(req.lastPatientMessageAt);

  if (inWindow) {
    if (!req.body) {
      throw new Error('Message body is required for in-session conversational messages');
    }
    return {
      to: req.to,
      from,
      messageType: 'in_session',
      body: req.body,
    };
  }

  // Outside 24-hour window: must be a business-initiated template message
  const templateKind = req.templateKind || 'reminder';
  const contentSid = getContentSidForTemplate(templateKind);
  const contentVariables = JSON.stringify(req.contentVariables || {});

  return {
    to: req.to,
    from,
    messageType: 'business_initiated_template',
    contentSid,
    contentVariables,
    // Optional fallback body representation for audit logging (never sent directly outside window)
    body: req.body || `[Template Message: ${templateKind}]`,
  };
}
