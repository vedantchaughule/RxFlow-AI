import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

export type PasswordResetEmail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export interface PasswordResetEmailAdapter {
  sendPasswordReset(message: PasswordResetEmail): Promise<void>;
}

export class CapturePasswordResetEmailAdapter implements PasswordResetEmailAdapter {
  private readonly messages = new Map<string, PasswordResetEmail>();

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    this.messages.set(message.to, { ...message });
  }

  latestFor(email: string): PasswordResetEmail | undefined {
    const message = this.messages.get(email);
    return message ? { ...message } : undefined;
  }

  clear(): void {
    this.messages.clear();
  }
}

class SmtpPasswordResetEmailAdapter implements PasswordResetEmailAdapter {
  private readonly transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    logger: false,
    debug: false,
  });

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    await this.transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: 'Reset your RxFlow password',
      text: `Use this link within ${message.expiresInMinutes} minutes to reset your RxFlow password:\n\n${message.resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    });
  }
}

const captureAdapter = new CapturePasswordResetEmailAdapter();
const adapter: PasswordResetEmailAdapter = env.EMAIL_ADAPTER === 'smtp'
  ? new SmtpPasswordResetEmailAdapter()
  : captureAdapter;

export function getPasswordResetEmailAdapter(): PasswordResetEmailAdapter {
  return adapter;
}

export function getDevelopmentPasswordResetCapture(): CapturePasswordResetEmailAdapter | undefined {
  return env.EMAIL_ADAPTER === 'capture' ? captureAdapter : undefined;
}
