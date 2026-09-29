import type { UserRole } from '../modules/users/user.model.js';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      validatedQuery?: unknown;
      auth?: {
        accessToken: string;
        userId: string;
        clinicId: string;
        role: UserRole;
        mustChangePassword: boolean;
        mfaEnrolled: boolean;
        mfaVerified: boolean;
      };
    }
  }
}

export {};
