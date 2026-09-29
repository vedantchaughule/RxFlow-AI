# RxFlow backend

Backend milestone 1 implements the PDR's MongoDB-backed authentication design.

## Setup

1. Copy `.env.example` to `.env` and fill in MongoDB, JWT, encryption, and cookie values.
2. Generate distinct 64-character JWT secrets and a 64-hex-character AES-256-GCM encryption key.
3. Install dependencies with `npm ci`.
4. Run `npm run typecheck` and `npm test`.
5. Start development with `npm run dev`.

MongoDB stores clinics, users, audit events, bcrypt-hashed rotating refresh tokens, and SHA-256 password-reset token digests. The backend never returns refresh tokens to browser JavaScript and never stores raw reset tokens.

## Password-only authentication API

Authentication is password-only; no MFA step is required by signup, login, refresh, password change, or recovery. Successful signup/login responses contain a short-lived access token while the rotating refresh credential is set only in the `HttpOnly`, `SameSite=Strict` cookie.

| Method | Path | Contract |
|---|---|---|
| POST | `/api/v1/auth/clinic-signup` | Creates a clinic administrator and session |
| POST | `/api/v1/auth/login` | Password login; returns `role` and `mustChangePassword` for routing |
| POST | `/api/v1/auth/refresh` | Rotates the refresh cookie and returns one new access token |
| POST | `/api/v1/auth/logout` | Revokes the authenticated session and clears the cookie |
| POST | `/api/v1/auth/password/complete-first-sign-in` | Replaces a staff temporary password, revokes sessions, and requires login again |
| POST | `/api/v1/auth/password/change` | Changes an authenticated password, revokes sessions, and requires login again |
| POST | `/api/v1/auth/password/forgot` | Always returns `202` with `{ accepted: true }`; local capture mode also returns `developmentResetUrl` |
| POST | `/api/v1/auth/password/reset` | Consumes a single-use token and returns `{ passwordReset: true, loginPath }` |

Reset tokens expire after `PASSWORD_RESET_TTL_MINUTES` (30 by default), are stored only as unique SHA-256 digests, and are invalidated when used or superseded. Production requires `EMAIL_ADAPTER=smtp`; capture mode is rejected at startup in production. SMTP failures return `503 EMAIL_UNAVAILABLE` and do not report a successful delivery.
