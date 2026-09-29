# RxFlow AI — Product Design & Requirements Document (PDR)

> **Version:** 1.3 — consent-led WhatsApp communications
> **Date:** 2026-08-02
> **Product:** RxFlow AI — Smart Clinic Automation Platform
> **Stack:** Node.js + Express + TypeScript + MongoDB + React + Vite
> **Blueprint Standard:** MERN + TypeScript Blueprint v2.2
> **Audience:** Developers, AI coding assistants, technical leads

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Repository Structure](#4-repository-structure)
5. [Environment Variables](#5-environment-variables)
6. [Database Schema](#6-database-schema)
7. [Backend Architecture](#7-backend-architecture)
8. [API Documentation](#8-api-documentation)
9. [Feature Specifications](#9-feature-specifications)
10. [WhatsApp Integration](#10-whatsapp-integration)
11. [AI Integration](#11-ai-integration)
12. [ML — No-Show Predictor](#12-ml--no-show-predictor)
13. [Frontend Architecture](#13-frontend-architecture)
14. [Security Checklist](#14-security-checklist)
15. [Background Jobs & Cron](#15-background-jobs--cron)
16. [Payments — Razorpay](#16-payments--razorpay)
17. [Deployment](#17-deployment)
18. [Business Model](#18-business-model)

---

## 1. Product Overview

### What is RxFlow AI?

RxFlow AI is designed as a **WhatsApp-first clinic automation platform** for small independent clinics in India. In the target product, doctors and receptionists work on a web dashboard and patients receive documents and updates on WhatsApp without installing an app.

### The Problem

Small clinics in India operate on:
- Handwritten prescriptions — lost, unreadable, error-prone
- Manual phone calls for appointment reminders — time-consuming
- No follow-up system — patients drop out silently
- No analytics — doctor cannot see clinic health at a glance

### Target End-State Solution

> The flow below is the product target, not a statement that every step is currently deployed. The verified application currently covers secure authentication, role-specific web workflows, clinic/staff administration, returning-patient search and numbered queues, manual clinician-reviewed prescriptions, and opaque patient QR issuance/resolution. PDF storage/delivery, appointments, WhatsApp, durable jobs, analytics, AI/ML, and billing remain roadmap work.

```
Patient arrives → Receptionist registers on dashboard
       ↓
Doctor writes prescription on dashboard (digital)
       ↓
Prescription PDF auto-sent to patient WhatsApp (< 3 seconds)
       ↓
Doctor sets next appointment → WhatsApp confirmation sent instantly
       ↓
Auto-reminders at 24hrs & 2hrs before appointment
       ↓
Patient replies CONFIRM / RESCHEDULE / CANCEL
       ↓
Dashboard updates in real-time — zero manual work
```

### Core Value Proposition

| For Clinics | For Patients |
|---|---|
| Zero paper prescriptions | Receive prescription PDF on WhatsApp |
| Zero manual reminder calls | Get appointment confirmed instantly |
| Real-time appointment board | Reply to confirm/reschedule/cancel |
| Complete patient history | No app download needed |
| Analytics and intelligence | Always know their next appointment |

### Features Summary and Verified Backend Status

Status meanings:

- **Implemented:** backend API, validation, authorization, clinic isolation, audit behavior, and tests exist.
- **Partial:** a safe, usable subset exists; the missing scope is stated explicitly.
- **Not started:** described in this PDR as a requirement only; no working backend should be inferred.

| Code | Feature | AI Required | Application status (2026-08-02) |
|---|---|---|---|
| F01 | Patient Registration and Returning-Patient Queue | No | **Implemented** — registration, duplicate-phone rejection, masked exact/prefix name disambiguation, confirmed repeat check-in, pagination, soft deletion, clinic isolation, and daily doctor queues |
| F02 | Digital Prescription Writer | No | **Partial** — final manual doctor-authored prescriptions exist; templates, PDF, and delivery do not |
| F03 | Instant WhatsApp Prescription Delivery | No | **Partial** — a generic prescription-ready template notification is queued after clinician finalization; no diagnosis, medicine details, PDF attachment, or private document delivery is sent |
| F04 | Appointment Setter | No | **Partial** — authenticated clinic-scoped appointment creation, board, slots, status updates, collision protection, audit events, and consent-gated confirmation jobs exist; the appointment UI and no-show scoring remain pending |
| F05 | Auto Reminder System | No | **Implemented backend** — durable 24-hour and 2-hour template jobs, bounded retries, dead-letter state, consent re-checks, and reception alerts exist |
| F06 | Patient Reply Tracker | No | **Implemented** — signed, idempotent webhooks record replies and CONFIRM/CANCEL appointment intent while alerting reception; unsupported free text remains a human follow-up |
| F07 | Appointment Status Board | No | **Not started** — the implemented visit queue is not an appointment board |
| F08 | One-Tap Prescription Templates | No | **Not started** |
| F09 | Voice Prescription Input | **Yes** | **Not started** |
| F10 | Opaque QR Patient Identity / Check-In | No | **Partial** — authenticated display/download, secure QR issue, resolve, and admin rotation exist; public self-check-in and external distribution do not |
| F11 | Smart Slot Management | No | **Not started** |
| F12 | One-Tap Rebooking | No | **Not started** |
| F13 | Patient Visit History | No | **Partial** — paginated queue/visit and role-scoped prescription reads exist; appointments and private PDFs do not |
| F15 | Patient Dropout Radar | No for current rules | **Implemented (rule-based)** — clinic-scoped due-date thresholds with exact explanations and doctor filtering; no medical-risk prediction or automated outreach |
| F16 | No-Show Predictor (ML) | No (local ML) | **Not started** |
| F18 | Post Visit Feedback | No | **Implemented** — one-time consent links, 1–5 rating, validated optional comment, clinic-private doctor/admin visibility, and no fabricated message delivery |
| F19 | Clinic Intelligence Dashboard | No | **Implemented (operations)** — real-data volume, waits, queue outcomes, workload, returning visits, no-shows, tracked messages, feedback, filters, and aggregate-only CSV |
| F20 | Multi Doctor Support | No | **Partial** — staff roles and per-doctor queues exist; doctor profiles/schedules/analytics do not |

### Implemented Platform Foundations

#### 2026-08-02 prescription-workflow update (takes precedence over earlier implementation-status wording)

The verified prescription workflow now has a doctor-only queue selector for the authenticated doctor's active `in_consultation` visits; structured diagnosis, notes, ordered medicines, dosage, frequency, duration, and instructions; session-only draft recovery after accidental navigation; and an explicit clinician-review confirmation. Finalization is atomic, completes the selected visit only after the prescription is saved, and makes the final clinical fields immutable. Doctors and admins can read clinic-scoped history and generate a private, non-cacheable printable PDF. The PDF uses active clinic branding, embeds a supported PNG/JPEG uploaded logo when present, and includes an opaque patient-identity QR verification link. It is generated on demand, not persisted to object storage or exposed publicly. With explicit patient consent and an approved utility template, finalization queues a generic prescription-ready notice that contains no diagnosis, medicine, notes, or PDF. Provider delivery is never claimed until a signed webhook confirms it; private document delivery remains a roadmap item.

| Foundation | Status |
|---|---|
| Self-managed authentication | **Implemented** — bcrypt password hashes; 15-minute access JWT; 7-day rotating refresh cookie; one active device session; five-attempt/15-minute lockout; hashed, single-use password-reset tokens |
| Password-only authentication | **Implemented** — clinic signup, administrator/staff login, refresh, first-login change, logout, and recovery do not require or redirect through MFA |
| Roles and staff lifecycle | **Implemented** — admin, doctor, receptionist; create/list/disable/enable/reset with guards |
| Clinic settings | **Implemented** — clinic settings and encrypted AI provider configuration; authorization is enforced by the backend admin guard |
| Tenant isolation | **Implemented** — clinic-scoped queries and ownership checks on protected resources |
| Audit records | **Implemented** for current security and clinical mutations; audit-log retrieval API remains pending |
| Frontend | **Implemented foundation** — responsive React/Vite role dashboards, role-aware authentication and forced-password flows, return routes, single-flight refresh, password recovery/visibility guidance, and explicit loading/empty/error/forbidden/session-expired/offline states |
| Automated testing | **Implemented foundation** — deterministic factories, isolated ephemeral MongoDB integration tests, mocked visual states, and isolated seeded Playwright workflows for all three roles |

### Verified Test Baseline

As of 2026-08-02, backend integration tests run through `npm run test:integration` against a fresh in-memory MongoDB replica set whose database name is guarded by the `rxflow_test_` prefix. They never read `.env` or use the development database. Deterministic factories cover clinics, admins, doctors, receptionists, patients, queue entries, prescriptions, operational analytics, dropout rules, and consented feedback. Frontend Playwright suites separate mocked visual/state checks from seeded workflow checks and cover admin, doctor, and receptionist authorization. The verified baseline is **23/23 backend unit**, **96/96 backend integration**, **2/2 frontend unit**, **31/31 workflow E2E**, **36/36 accessibility**, and **39/39 visual**, with **0 skipped**. Both production builds and typechecks pass; high/critical audit gates pass. The frontend audit reports two moderate React Router 6 advisories whose available automated fix is the breaking React Router 7 migration; the affected routes use only validated/static destinations in this release.

### Backend-First Delivery Roadmap

#### Verification update (2026-08-02; supersedes the count line above)

The current verification run passed backend typechecking, production build, 23 unit tests, 96 integration tests, and the high/critical audit gate. The frontend passed typechecking, production build, 2 unit tests, and 31 workflow E2E tests. Accessibility passed all 36 desktop, tablet, and mobile checks. Visual regression passed all 39 comparisons, including operational analytics at desktop, tablet, and mobile sizes. The frontend audit has no high/critical finding, but reports two moderate React Router 6 advisories; the automated remediation is the breaking React Router 7 migration and is not silently applied by this milestone.

Each milestone must be implemented and verified independently with validation, authorization, clinic ownership, indexes, audit logging, API documentation, and tests before the next milestone begins.

1. **Current verified foundation:** password-only authentication and recovery, clinic settings, staff roles/lifecycle, audit recording, patients, returning-patient search, daily doctor queue, opaque QR identity, manual final prescriptions, role-aware frontend, and isolated automated tests. No MFA step is part of the active authentication policy or browser flow.
2. Prescription templates and completion of the digital-prescription workflow.
3. PDF generation plus a provider-neutral private document-storage abstraction and authorization-checked access.
4. Appointments, doctor schedules, atomic slot-conflict protection, and rebooking.
5. WhatsApp provider abstraction, sandbox adapter, verified webhooks, and delivery tracking.
6. Durable reminder/follow-up jobs with idempotency, leases/concurrency control, retries, and failure handling.
7. Expanded patient history and the public-facing QR check-in handoff, while keeping QR payloads opaque.
8. Feedback and clinic analytics.
9. Clinician-reviewed AI voice prescription drafts and dropout outreach with schema validation and safe fallbacks.
10. Feature-gated no-show ML service with non-blocking fallback behavior.
11. Razorpay billing/subscriptions/webhooks, deployment, monitoring, and production hardening.
12. Continue the frontend only after each corresponding backend contract is implemented and verified; the role/dashboard and automated-testing foundation is complete.

> **Note:** F14 (Lab Report Explainer) and F17 (WhatsApp Campaign Automation) have been removed from scope.
> Only **F09** and **F15** are designed to require an external AI API key. The other 16 features are designed to operate without AI, whether or not their implementation has started.

---

## 2. Tech Stack

> ⚠️ **Version Safety Rule:** Never hardcode version numbers. Before writing `package.json`, web search each dependency for latest stable + security advisories. Confirm with `npm show <pkg> version`.

### Current Implementation

The current backend uses Express, TypeScript, Mongoose/MongoDB, Zod, JSON Web Tokens, bcrypt, Helmet, CORS, rate limiting, Pino/Pino HTTP, cookie parsing, TOTP utilities, and QR-code generation. MongoDB is the active persistence layer. The package lockfile is the authority for exact installed versions.

Everything else listed in this section is a planned dependency or infrastructure choice and must not be treated as installed or operational. A React/Vite frontend and Playwright/Vitest test toolchain exist; no Socket.IO, cron worker, PDF generator, WhatsApp adapter, Sentry integration, Cloudinary adapter, ML service, or Razorpay integration exists yet.

### Target Backend Dependency Catalog

| Package | Purpose | Verify |
|---|---|---|
| `express` | HTTP framework | npm show + advisory |
| `typescript` | Language (strict mode) | npm show |
| `mongoose` | MongoDB ODM | npm show + Atlas compat |
| `zod` | Env + request validation | npm show |
| `jsonwebtoken` | JWT sign/verify | npm show + advisory |
| `bcryptjs` | Password hashing | npm show |
| `helmet` | Security headers | npm show + advisory |
| `cors` | CORS middleware | npm show |
| `express-rate-limit` | Rate limiting | npm show |
| `express-mongo-sanitize` | NoSQL injection prevention | npm show |
| `socket.io` | Real-time dashboard updates | npm show |
| `node-cron` | Background reminder jobs | npm show |
| `nodemailer` | Email (internal alerts) | npm show |
| `winston` | Structured logging | npm show |
| `@sentry/node` | Error monitoring | npm show + Sentry docs |
| `axios` | HTTP client (WhatsApp API calls) | npm show |
| `multer` | File upload (prescription PDFs) | npm show |
| `pdfkit` | PDF generation | npm show |
| `qrcode` | QR code generation (F10) | npm show |
| `razorpay` | Payments SDK | npm show |

### Planned Frontend Dependency Catalog

| Package | Purpose | Verify |
|---|---|---|
| `react` + `vite` | SPA framework | npm show each |
| `typescript` | Language (strict mode) | npm show |
| `react-router-dom` | Client-side routing | npm show |
| `@tanstack/react-query` | Server state + caching | npm show |
| `axios` | HTTP client + interceptors | npm show |
| `react-hook-form` + `zod` | Validated forms | npm show each |
| `dompurify` | XSS prevention | npm show + advisory |
| `socket.io-client` | Real-time connection | npm show |
| `recharts` | Analytics charts (F19) | npm show |
| `react-hot-toast` | Notifications | npm show |
| `date-fns` | Date formatting | npm show |

### Target Infrastructure

| Service | Purpose | Current status |
|---|---|---|
| MongoDB / MongoDB Atlas | Database | MongoDB integration implemented; production host is environment-specific |
| WhatsApp Business API | Patient communication | Planned |
| Razorpay | Subscription billing | Planned |
| Vercel | Frontend hosting | Planned; the frontend exists but is not deployed |
| Render / Railway | Backend hosting | Planned deployment target |
| Sentry | Error monitoring | Planned |
| Private object storage | Prescription PDFs | Planned; provider must be abstracted and objects private |

### Token Lifetime Standard

- **Access JWT:** `15 minutes` — sent in `Authorization: Bearer` header
- **Refresh token:** `7 days` — stored in `HttpOnly; Secure; SameSite=Strict` cookie

---

## 3. User Roles & Permissions

### Role Hierarchy

```
Clinic Admin (owner)
    ├── Doctor
    └── Receptionist
```

### Permissions Matrix

| Action | Admin | Doctor | Receptionist |
|---|---|---|---|
| Register patients | Yes | Yes | Yes |
| Write prescriptions | No | Yes | No |
| Set appointments | Yes | Yes | Yes |
| View appointment board | Yes | Yes | Yes |
| View patient history | Yes | Yes | Limited |
| Create prescription templates | No | Yes | No |
| View analytics (F19) | Yes | Yes | No |
| Manage doctors (F20) | Yes | No | No |
| Configure AI API key | Yes | No | No |
| Configure slot settings | Yes | Yes | No |
| Send dropout reminders | Yes | Yes | No |
| View feedback scores | Yes | Yes | No |
| Manage billing | Yes | No | No |

### Role Guard Implementation

```typescript
// src/middleware/roleGuard.ts
export const requireRole = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
      });
    }
    next();
  };
```

---

## 4. Repository Structure

### Current Implemented Structure

```text
backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/                 # validated environment and MongoDB connection
│   ├── middleware/             # authentication, validation, and error handling
│   ├── modules/
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── clinics/
│   │   ├── patients/           # patients, visit queue, counters, opaque QR
│   │   ├── prescriptions/      # manual final prescriptions
│   │   └── users/              # staff lifecycle
│   ├── shared/                 # JWT, encryption, security, validation, errors
│   └── types/
└── tests/
```

There is currently no frontend, ML service, jobs worker, WhatsApp service, billing module, PDF service, socket layer, or Postman collection. Those paths below describe the intended end-state organization only.

### Target Repository Structure

```
rxflow-ai/
├── backend/
│   ├── src/
│   │   ├── server.ts                    # Entry: DB → cron start → listen
│   │   ├── app.ts                       # Express app: middleware + routes
│   │   ├── config/
│   │   │   ├── env.ts                   # Zod-validated env — crash on bad config
│   │   │   ├── db.ts                    # mongoose.connect + disconnect
│   │   │   └── passport.ts             # Google OAuth (only if env vars present)
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts           # JWT verify → attach req.user
│   │   │   ├── validate.ts             # Zod schema factory → 400 on failure
│   │   │   ├── roleGuard.ts            # Role-based access enforcement
│   │   │   └── errorHandler.ts         # Central error → standard JSON response
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   └── auth.schema.ts
│   │   │   ├── patients/
│   │   │   │   ├── patient.routes.ts
│   │   │   │   ├── patient.controller.ts
│   │   │   │   ├── patient.service.ts
│   │   │   │   ├── patient.model.ts
│   │   │   │   └── patient.schema.ts
│   │   │   ├── prescriptions/
│   │   │   │   ├── prescription.routes.ts
│   │   │   │   ├── prescription.controller.ts
│   │   │   │   ├── prescription.service.ts
│   │   │   │   ├── prescription.model.ts
│   │   │   │   └── prescription.schema.ts
│   │   │   ├── appointments/
│   │   │   │   ├── appointment.routes.ts
│   │   │   │   ├── appointment.controller.ts
│   │   │   │   ├── appointment.service.ts
│   │   │   │   ├── appointment.model.ts
│   │   │   │   └── appointment.schema.ts
│   │   │   ├── templates/
│   │   │   │   ├── template.routes.ts
│   │   │   │   ├── template.controller.ts
│   │   │   │   ├── template.service.ts
│   │   │   │   ├── template.model.ts
│   │   │   │   └── template.schema.ts
│   │   │   ├── feedback/
│   │   │   │   ├── feedback.routes.ts
│   │   │   │   ├── feedback.controller.ts
│   │   │   │   ├── feedback.service.ts
│   │   │   │   ├── feedback.model.ts
│   │   │   │   └── feedback.schema.ts
│   │   │   ├── analytics/
│   │   │   │   ├── analytics.routes.ts
│   │   │   │   ├── analytics.controller.ts
│   │   │   │   └── analytics.service.ts
│   │   │   ├── clinic/
│   │   │   │   ├── clinic.routes.ts
│   │   │   │   ├── clinic.controller.ts
│   │   │   │   ├── clinic.service.ts
│   │   │   │   ├── clinic.model.ts
│   │   │   │   └── clinic.schema.ts
│   │   │   └── users/
│   │   │       ├── user.routes.ts
│   │   │       ├── user.controller.ts
│   │   │       ├── user.service.ts
│   │   │       ├── user.model.ts
│   │   │       └── user.schema.ts
│   │   ├── services/
│   │   │   ├── whatsapp.service.ts      # WhatsApp Business API wrapper
│   │   │   ├── pdf.service.ts           # Prescription PDF generation
│   │   │   ├── qr.service.ts            # QR code generation (F10)
│   │   │   ├── ai.service.ts            # AI API provider-agnostic wrapper
│   │   │   ├── ml.service.ts            # No-show predictor HTTP client
│   │   │   ├── reminder.service.ts      # Appointment reminder logic
│   │   │   ├── dropout.service.ts       # Dropout radar logic (F15)
│   │   │   ├── email.service.ts         # Internal email alerts
│   │   │   └── cron.service.ts          # node-cron job registry
│   │   ├── sockets/
│   │   │   └── index.ts                # Socket.io auth guard + room setup
│   │   ├── utils/
│   │   │   ├── jwt.ts                  # signAccess, signRefresh, verify
│   │   │   ├── encryption.ts           # AES-256-GCM encrypt/decrypt
│   │   │   ├── ownershipCheck.ts       # Assert resource belongs to clinic
│   │   │   └── tokenCompare.ts         # crypto.timingSafeEqual wrapper
│   │   └── types/
│   │       ├── express.d.ts            # Augment Express Request with req.user
│   │       └── whatsapp.d.ts           # WhatsApp API response types
│   ├── ml/
│   │   ├── train.py                    # scikit-learn Random Forest training
│   │   ├── predict.py                  # Prediction API (FastAPI micro-service)
│   │   ├── model.pkl                   # Serialized trained model
│   │   └── requirements.txt            # Python deps for ML only
│   ├── postman/
│   │   ├── collection.json
│   │   └── environment.json
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── lib/
│   │   │   ├── env.ts                  # VITE_* Zod validation
│   │   │   └── api/
│   │   │       ├── client.ts           # Axios base + withCredentials + interceptors
│   │   │       └── refreshClient.ts    # Separate instance for refresh (no loop)
│   │   ├── auth/
│   │   │   ├── AuthProvider.tsx
│   │   │   └── tokenStore.ts           # In-memory token (never localStorage)
│   │   ├── components/
│   │   │   ├── RequireAuth.tsx
│   │   │   ├── RoleGuard.tsx
│   │   │   └── ErrorBoundary.tsx
│   │   ├── features/
│   │   │   ├── patients/
│   │   │   ├── prescriptions/
│   │   │   ├── appointments/
│   │   │   ├── templates/
│   │   │   ├── analytics/
│   │   │   ├── feedback/
│   │   │   └── settings/
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── Patients.tsx
│   │       ├── NewPrescription.tsx
│   │       ├── AppointmentBoard.tsx
│   │       ├── PatientHistory.tsx
│   │       ├── Analytics.tsx
│   │       ├── Settings.tsx
│   │       └── Login.tsx
│   ├── .env.example
│   ├── .gitignore
│   └── package.json
│
└── docs/
    ├── RxFlow_AI_PDR.md
    └── BLUEPRINT.md
```

---

## 5. Environment Variables

Never print, expose, commit, or overwrite a real `.env`. The tracked [backend/.env.example](../backend/.env.example) and Zod schema in `backend/src/config/env.ts` are the source of truth for current names and validation.

### Current Implemented Backend Contract

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rxflow_dev
JWT_ACCESS_SECRET=<at-least-64-random-characters>
JWT_REFRESH_SECRET=<different-at-least-64-random-characters>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=<64-hex-characters>
CLIENT_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
COOKIE_SECURE=false
COOKIE_DOMAIN=
AUTH_COOKIE_NAME=rxflow_refresh
PLATFORM_SUPPORT_KEY=<at-least-32-random-characters>
SESSION_IDLE_MINUTES=15
SESSION_MAX_DAYS=7
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
MIN_PASSWORD_LENGTH=12
```

### Target Expansion Variables (Not Yet Consumed)

The following example records later integration requirements. WhatsApp, private document storage, Razorpay, email, ML, and Sentry variables must be added to `.env.example` and Zod validation only when their owning milestone is implemented.

```env
# ── Server ────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=5000

# ── Database ──────────────────────────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/rxflow_dev
# Production: mongodb+srv://<user>:<pass>@cluster.mongodb.net/rxflow

# ── JWT ───────────────────────────────────────────────────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=replace_with_64_char_hex
JWT_REFRESH_SECRET=replace_with_different_64_char_hex
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Frontend URL ──────────────────────────────────────────────────────────
CLIENT_URL=http://localhost:5173

# ── CORS ──────────────────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:5173

# ── Encryption (for AI API keys stored in DB) ─────────────────────────────
# Generate: openssl rand -hex 32
ENCRYPTION_KEY=replace_with_64_char_hex

# ── WhatsApp Business API ─────────────────────────────────────────────────
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token

# ── File Storage (PDF + QR codes) ────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Razorpay ─────────────────────────────────────────────────────────────
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# ── Email (internal alerts) ───────────────────────────────────────────────
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=your_smtp_api_key
EMAIL_FROM=noreply@rxflow.in

# ── ML Microservice ───────────────────────────────────────────────────────
ML_SERVICE_URL=http://localhost:8000

# ── Monitoring ────────────────────────────────────────────────────────────
SENTRY_DSN=https://your_sentry_dsn_here
```

### Planned Frontend `.env.example`

**Status:** Planned — the frontend does not exist yet.

```env
# ── API ───────────────────────────────────────────────────────────────────
VITE_API_BASE_URL=http://localhost:5000

# ── Feature Flags ─────────────────────────────────────────────────────────
VITE_ENABLE_REAL_TIME=true
VITE_ENABLE_VOICE_INPUT=true
```

### Target Expanded Env Validation (Illustrative)

**Status:** Planned. Do not copy this expanded schema over the current schema before the corresponding services exist. The current implementation validates every currently consumed variable at startup.

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number).default('5000'),
  MONGODB_URI: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CLIENT_URL: z.string().url(),
  CORS_ORIGINS: z.string(),
  ENCRYPTION_KEY: z.string().length(64),
  WHATSAPP_API_URL: z.string().url(),
  WHATSAPP_PHONE_NUMBER_ID: z.string(),
  WHATSAPP_ACCESS_TOKEN: z.string(),
  WHATSAPP_VERIFY_TOKEN: z.string(),
  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
  RAZORPAY_KEY_ID: z.string(),
  RAZORPAY_KEY_SECRET: z.string(),
  RAZORPAY_WEBHOOK_SECRET: z.string(),
  ML_SERVICE_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
```

---

## 6. Database Schema

### Clinic

**Implementation status:** Implemented. The current model is:

```typescript
{
  _id: ObjectId,
  name: String,
  email: String,                       // globally unique clinic login/contact email
  address: String,
  city: String,
  state: String,
  phone: String,
  logoUrl: String,
  registrationNumber: String,          // For prescription letterhead
  plan: enum['starter', 'growth', 'pro'],
  planExpiresAt: Date,
  razorpaySubscriptionId: String,
  status: enum['active', 'suspended'],

  // AI Config (F09, F15) — API key encrypted with AES-256-GCM
  aiConfig: {
    provider: String,                  // "openai" | "gemini" | "anthropic"
    baseUrl: String,
    modelName: String,
    encryptedApiKey: String,           // AES-256-GCM encrypted
    isConfigured: Boolean
  },

  // Slot Config (F11)
  workingHours: {
    start: String,                     // "09:00"
    end: String,                       // "18:00"
    breakStart: String,                // "13:00"
    breakEnd: String                   // "14:00"
  },
  maxPatientsPerHour: Number,          // Default: 4

  passwordPolicy: {
    minLength: Number,                 // 12–128
    requireUppercase: Boolean,
    requireLowercase: Boolean,
    requireNumber: Boolean,
    requireSymbol: Boolean
  },

  createdAt: Date,
  updatedAt: Date
}
```

### User (Doctor / Receptionist / Admin)

**Implementation status:** Implemented for identity, security, role, and staff lifecycle. Doctor registration/profile fields and doctor-specific schedules are planned and are not present in the current model.

```typescript
{
  _id: ObjectId,
  clinicId: ObjectId,                  // ref: Clinic
  name: String,
  email: String,                       // unique per clinic
  passwordHash: String,                // bcrypt cost 10+
  role: enum['admin', 'doctor', 'receptionist'],
  status: enum['active', 'disabled'],
  mustChangePassword: Boolean,
  failedLoginCount: Number,
  lockedUntil: Date,
  sessionInvalidBefore: Date,
  sessionVersion: Number,
  mfaRequired: Boolean,
  mfaEnrolled: Boolean,
  mfaSecretEncrypted: String,           // private/select:false
  mfaRecoveryCodesHash: [String],       // private/select:false
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Refresh credentials are not stored on `User`. They are isolated in the implemented `AuthSession` collection:

```typescript
{
  userId: ObjectId,
  clinicId: ObjectId,
  sessionId: String,                    // unique
  refreshTokenHash: String,             // private/select:false
  mfaChallengeHash: String,             // private/select:false
  mfaChallengeExpiresAt: Date,
  mfaVerifiedAt: Date,
  issuedAt: Date,
  lastActivityAt: Date,
  expiresAt: Date,                      // indexed for expiry cleanup/querying
  revokedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Patient

**Implementation status:** Implemented for registration, returning-patient lookup, clinic ownership, soft deletion, queue history, and opaque QR identity. Appointment/dropout fields exist as forward-compatible storage only; appointment and dropout services are not implemented.

```typescript
{
  _id: ObjectId,
  clinicId: ObjectId,                  // ref: Clinic
  assignedDoctorId: ObjectId,          // ref: User
  registeredById: ObjectId,            // ref: User (receptionist)

  // Personal info
  name: String,
  normalizedName: String,               // private normalized exact/prefix search key
  phone: String,                       // WhatsApp number (with country code)
  age: Number,
  gender: enum['male', 'female', 'other'],
  bloodGroup: String,

  // Intake info
  chiefComplaint: String,

  // QR Code (F10) — QR contains only a random opaque token, never patient data
  qrTokenHash: String,                 // SHA-256 lookup hash, never returned
  qrTokenEncrypted: String,            // AES-256-GCM token copy for QR regeneration
  qrIssuedAt: Date,

  // Visit tracking
  totalVisits: Number,
  lastVisitDate: Date,
  nextAppointmentId: ObjectId,         // ref: Appointment

  // Dropout tracking (F15)
  followupDueDate: Date,
  dropoutStatus: enum['active', 'overdue_7', 'overdue_14', 'overdue_30', 'overdue_60'],
  lastDropoutMessageSentAt: Date,
  dropoutReplied: Boolean,

  isDeleted: Boolean,
  deletedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
```
{ clinicId: 1, phone: 1 }            — unique among non-deleted patients
{ clinicId: 1, normalizedName: 1, isDeleted: 1 }
{ clinicId: 1, qrTokenHash: 1 }      — unique partial index
{ clinicId: 1, assignedDoctorId: 1, isDeleted: 1 }
{ clinicId: 1, dropoutStatus: 1, isDeleted: 1 }
```

### Visit Queue and Queue Counter

**Implementation status:** Implemented. Returning patients are found by full name and checked in without completing a second registration form. Queue numbers are atomic, daily, and doctor-specific.

```typescript
VisitQueue {
  clinicId: ObjectId,
  patientId: ObjectId,
  doctorId: ObjectId,
  checkedInById: ObjectId,
  queueDate: String,                    // clinic-local YYYY-MM-DD
  queueNumber: Number,
  status: enum['waiting', 'in_consultation', 'completed', 'cancelled'],
  checkedInAt: Date,
  consultationStartedAt: Date,
  completedAt: Date,
  cancelledAt: Date
}

QueueCounter {
  _id: String,                          // clinic + doctor + queueDate composite key
  sequence: Number
}
```

**Queue indexes:**

```text
{ clinicId: 1, doctorId: 1, queueDate: 1, queueNumber: 1 } — unique
{ clinicId: 1, patientId: 1, queueDate: 1 } — unique; prevents duplicate same-day check-in
{ clinicId: 1, patientId: 1 } — unique partial index for waiting/in_consultation; prevents duplicate active entries across clinic days
{ clinicId: 1, doctorId: 1, queueDate: 1, status: 1, queueNumber: 1 }
{ clinicId: 1, patientId: 1, checkedInAt: -1 }
```

### Prescription

> **Status update (2026-08-02):** The paragraph below predates the on-demand printable PDF endpoint. PDFs are now generated privately for authorised doctor/admin requests, use clinic branding and a supported PNG/JPEG logo when present, and include an opaque QR verification link. They are not stored in a private object store. WhatsApp delivery remains pending until provider confirmation.

**Implementation status:** Manual clinician-confirmed prescriptions and on-demand private PDF generation are implemented. A consent-gated generic WhatsApp prescription-ready notice is implemented, but it deliberately contains no clinical content or PDF attachment. Private object storage and document delivery remain pending.

```typescript
{
  _id: ObjectId,
  clinicId: ObjectId,                  // ref: Clinic
  patientId: ObjectId,                 // ref: Patient
  doctorId: ObjectId,                  // ref: User
  queueEntryId: ObjectId,              // ref: VisitQueue; unique within clinic

  visitDate: Date,
  diagnosis: String,
  doctorNotes: String,

  medicines: [
    {
      name: String,
      dosage: String,                  // "500mg"
      frequency: String,               // "Twice daily"
      duration: String,                // "5 days"
      instructions: String             // "After food"
    }
  ],

  clinicianConfirmedAt: Date,
  pdfStorageKey: String,               // private/select:false; planned storage milestone
  whatsappMessageId: String,           // For delivery tracking
  deliveryStatus: enum['pending', 'sent', 'delivered', 'read', 'failed'],
  sentAt: Date,

  // Source tracking
  source: enum['manual', 'voice', 'template'],
  templateId: ObjectId,               // ref: Template (if source = template)

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**

```text
{ clinicId: 1, queueEntryId: 1 } — unique; one final prescription per consultation
{ clinicId: 1, patientId: 1, visitDate: -1 }
{ clinicId: 1, doctorId: 1, visitDate: -1 }
```

### Appointment

**Implementation status:** Partial — clinic-scoped creation, boards, local slot availability, exact-slot collision protection, terminal-status updates, audits, consent-gated confirmations/reminders, signed status webhooks, and patient replies are implemented. No-show scoring and rebooking remain planned.

```typescript
{
  _id: ObjectId,
  clinicId: ObjectId,                  // ref: Clinic
  patientId: ObjectId,                 // ref: Patient
  doctorId: ObjectId,                  // ref: User

  scheduledAt: Date,                   // Full datetime
  durationMinutes: Number,             // Default: 15

  status: enum[
    'confirmed',
    'pending',
    'rescheduled',
    'cancelled',
    'completed',
    'no_show'
  ],

  // WhatsApp tracking
  confirmationMessageId: String,
  reminder24hMessageId: String,
  reminder2hMessageId: String,
  patientReply: String,
  patientRepliedAt: Date,

  // Reminder sent tracking
  reminder24hSentAt: Date,
  reminder2hSentAt: Date,

  // No-show predictor (F16)
  noShowRisk: enum['low', 'medium', 'high'],
  noShowRiskScore: Number,             // 0.0 - 1.0

  // Feedback (F18)
  feedbackSentAt: Date,
  feedbackRating: Number,             // 1-5
  feedbackMessageId: String,

  // Rebooking (F12)
  rebooked: Boolean,
  rebookedAppointmentId: ObjectId,

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
```
{ clinicId: 1, doctorId: 1, scheduledAt: 1 }
{ clinicId: 1, patientId: 1, scheduledAt: -1 }
{ clinicId: 1, status: 1, scheduledAt: 1 }
```

### Template (F08)

**Implementation status:** Planned — no template model or endpoints currently exist.

```typescript
{
  _id: ObjectId,
  clinicId: ObjectId,
  doctorId: ObjectId,

  name: String,                        // "Fever + Cold"
  diagnosis: String,
  medicines: [
    {
      name: String,
      dosage: String,
      frequency: String,
      duration: String,
      instructions: String
    }
  ],
  doctorNotes: String,
  usageCount: Number,

  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Feedback (F18)

**Implementation status:** Planned — no feedback model or endpoints currently exist.

```typescript
{
  _id: ObjectId,
  clinicId: ObjectId,
  appointmentId: ObjectId,
  patientId: ObjectId,
  doctorId: ObjectId,

  rating: Number,                      // 1-5
  whatsappMessageId: String,
  googleReviewLinkSent: Boolean,       // Sent if rating = 5
  alertSentToDoctor: Boolean,          // Sent if rating <= 3
  repliedAt: Date,

  createdAt: Date
}
```

---

## 7. Backend Architecture

### Current Implemented Middleware and Route Mounts

The application currently disables `x-powered-by`, trusts one proxy hop, applies Helmet, Pino HTTP logging with URL/query/params/headers/network fields redacted, explicit-origin credentialed CORS, a 10 KB JSON body limit, cookie parsing, and a global rate limit. It mounts auth, clinic, patient, and prescription modules before the 404 and central error handlers. Health and readiness endpoints bypass the rate limiter.

`express-mongo-sanitize`, Sentry, a WhatsApp webhook limiter, Socket.IO, and service-specific job middleware are not currently installed. Strict Zod object schemas reject unexpected request fields, but the dedicated NoSQL-sanitization milestone remains pending.

### Target Expanded Middleware Stack Order

**Status:** Illustrative future architecture; it is not the current `app.ts`.

```typescript
// src/app.ts

// 1. Sentry request handler (must be first)
app.use(Sentry.Handlers.requestHandler());

// 2. Security headers
app.use(helmet());

// 3. CORS — explicit origin list, never '*' with credentials
app.use(cors({
  origin: env.CORS_ORIGINS.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// 4. Body parsing (10kb limit)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// 5. NoSQL injection prevention
app.use(mongoSanitize());

// 6. HTTP logging (dev only)
if (env.NODE_ENV === 'development') app.use(morgan('dev'));

// 7. Global rate limit (100 req/min per IP)
const globalLimiter = rateLimit({ windowMs: 60_000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api', globalLimiter);

// 8. Strict rate limit on auth routes
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, skipSuccessfulRequests: true });
app.use('/api/v1/auth', authLimiter);

// 9. WhatsApp webhook rate limit
const webhookLimiter = rateLimit({ windowMs: 60_000, max: 200 });
app.use('/api/v1/whatsapp/webhook', webhookLimiter);

// 10. Routes
app.use('/api/v1', router);

// 11. Sentry error handler
app.use(Sentry.Handlers.errorHandler());

// 12. Central error handler (always last)
app.use(errorHandler);
```

### Health Endpoints

```typescript
// Liveness — no auth, no DB
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Readiness — checks MongoDB
app.get('/ready', (req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  if (!dbReady) return res.status(503).json({ status: 'not ready', db: 'disconnected' });
  res.json({ status: 'ready', db: 'connected' });
});
```

### Standard Response Shapes

```typescript
// All error responses:
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "fields": { "phone": ["Invalid phone number format"] }  // Only on VALIDATION_ERROR
  }
}

// All success responses:
{ "success": true, "data": { ... } }

// Paginated list:
{
  "success": true,
  "data": [...],
  "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

### Error Codes Reference

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod validation failed |
| 400 | `INVALID_REQUEST` | Logically invalid request |
| 400 | `SLOT_FULL` | No slots available |
| 401 | `UNAUTHORIZED` | No token provided |
| 401 | `TOKEN_EXPIRED` | Access token expired |
| 401 | `TOKEN_INVALID` | Token tampered |
| 401 | `REFRESH_TOKEN_INVALID` | Refresh token not found |
| 403 | `FORBIDDEN` | Wrong role |
| 403 | `PLAN_UPGRADE_REQUIRED` | Feature not on current plan |
| 404 | `NOT_FOUND` | Resource not found or belongs to another clinic |
| 409 | `CONFLICT` | Duplicate phone number |
| 409 | `DOUBLE_BOOKING` | Appointment slot already taken |
| 422 | `AI_NOT_CONFIGURED` | AI API key not set up |
| 422 | `WHATSAPP_DELIVERY_FAILED` | WhatsApp API error |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unhandled server error |

### Ownership Check Helper

```typescript
// src/utils/ownershipCheck.ts
// Always filters by clinicId — cross-clinic data access impossible
export async function assertClinicOwnership<T>(
  ModelClass: Model<T>,
  resourceId: string,
  clinicId: string
): Promise<T> {
  const doc = await ModelClass.findOne({
    _id: new Types.ObjectId(resourceId),
    clinicId: new Types.ObjectId(clinicId)
  });
  if (!doc) {
    const err = new Error('Resource not found') as any;
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return doc;
}
```

---

## 8. API Documentation

This section is an implementation-aligned summary. [API_Documentation.md](./API_Documentation.md) is the detailed contract for implemented endpoints. Any route explicitly marked **Planned** below is not available in the backend.

### Auth Routes

#### POST /api/v1/auth/clinic-signup
**Description:** Register a new clinic admin. Clinic creation is rolled back if admin creation fails.
**Auth required:** No

**Request Body:**
```json
{
  "clinicName": "Dr. Sharma's Clinic",
  "adminName": "Dr. Ramesh Sharma",
  "email": "ramesh@sharma-clinic.com",
  "password": "a strong password satisfying clinic policy"
}
```

**Response — 201 Created:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "expiresIn": 900,
    "mfaRequired": false,
    "nextStep": "dashboard",
    "mfaVerified": false
  }
}
```

**Business Rules:**
- Clinic email must be unique
- Password is checked against the clinic password policy; default minimum is 12 characters
- Refresh token is hashed in a separate MongoDB session and set only as a Secure, HttpOnly, SameSite=Strict cookie
- Password-only login is sufficient; backend role and tenant guards authorize privileged actions. Optional TOTP endpoints remain available for future policy use.

---

#### POST /api/v1/auth/login
**Description:** Login with email and password
**Auth required:** No

**Request Body:**
```json
{ "email": "ramesh@sharma-clinic.com", "password": "SecurePass@123" }
```

**Response — 200 OK:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "expiresIn": 900,
    "role": "admin",
    "mustChangePassword": false,
    "mfaRequired": false,
    "mfaEnrolled": false,
    "mfaVerified": false
  }
}
```

---

#### POST /api/v1/auth/refresh
**Description:** Get new access token using refresh cookie
**Auth required:** No (uses HttpOnly cookie)

**Response — 200 OK:**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "expiresIn": 900, "mfaVerified": true } }
```

---

#### POST /api/v1/auth/logout
**Description:** Invalidate refresh token and clear cookie
**Auth required:** Yes

**Response — 200 OK:**
```json
{ "success": true, "data": { "loggedOut": true } }
```

---

#### POST /api/v1/auth/password/forgot
**Description:** Request a short-lived password-reset email without revealing whether the account exists
**Auth required:** No

**Request Body:**
```json
{ "email": "ramesh@sharma-clinic.com" }
```

**Response — 202 Accepted:**
```json
{ "success": true, "data": { "accepted": true } }
```

When the explicitly local/test `capture` adapter is active, the response also includes `developmentResetUrl` so isolated browser workflows can consume the link. Production startup rejects capture mode, and production responses never expose a reset token or URL.

---

#### POST /api/v1/auth/password/reset
**Description:** Consume a reset token and set a new password
**Auth required:** No

**Request Body:**
```json
{ "token": "raw-token-from-email", "newPassword": "NewUniquePassphrase123" }
```

**Response — 200 OK:**
```json
{ "success": true, "data": { "passwordReset": true, "loginPath": "/login" } }
```

Only a SHA-256 digest is persisted. Tokens are single-use, expire after 30 minutes by default, and are invalidated by a newer request. Completion changes the password, clears lockout state, increments the user's session version, revokes every session for that user, and writes an audit event without the raw token. Staff receive `/staff-login`; administrators receive `/login`.

---

#### Other Implemented Auth and Staff Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/auth/me` | Current authenticated identity/session state |
| POST | `/api/v1/auth/password/change` | Change password and invalidate other sessions |
| POST | `/api/v1/auth/password/complete-first-sign-in` | Replace a staff temporary password, revoke sessions, and require login again |
| POST | `/api/v1/auth/password/forgot` | Generic reset request; local capture URL is never returned in production |
| POST | `/api/v1/auth/password/reset` | Consume a hashed, expiring, single-use reset token and revoke sessions |
| POST | `/api/v1/auth/mfa/enroll` | Begin admin TOTP enrollment |
| POST | `/api/v1/auth/mfa/challenge` | Create a short-lived MFA challenge |
| POST | `/api/v1/auth/mfa/verify` | Verify TOTP and mark the session MFA-verified |
| POST | `/api/v1/auth/mfa/recover` | Consume a recovery code and rotate recovery state |
| POST | `/api/v1/auth/staff` | Admin creates doctor/receptionist |
| GET | `/api/v1/auth/staff` | Admin lists clinic staff |
| POST | `/api/v1/auth/staff/:userId/disable` | Disable staff and revoke sessions |
| POST | `/api/v1/auth/staff/:userId/enable` | Re-enable staff |
| POST | `/api/v1/auth/staff/:userId/reset-password` | Admin reset with forced change on next login |

The refresh flow rotates its hashed credential and detects replay. Creating a new active device session revokes the previous active device session for that user. Five failed logins lock the account for 15 minutes.

---

### Patient Routes

#### POST /api/v1/patients — F01
**Description:** Register a new patient
**Auth required:** Yes | **Minimum role:** receptionist

**Request Body:**
```json
{
  "name": "Priya Mehta",
  "phone": "+919876543210",
  "age": 34,
  "gender": "female",
  "bloodGroup": "B+",
  "chiefComplaint": "Persistent fever for 3 days",
  "assignedDoctorId": "64a1b2c3d4e5f6a7b8c9d0e1"
}
```

**Response — 201 Created:**
```json
{
  "success": true,
  "data": {
    "patient": {
      "_id": "...",
      "name": "Priya Mehta",
      "phone": "+919876543210",
      "assignedDoctorId": "..."
    },
    "queueEntry": { "_id": "...", "queueNumber": 1, "status": "waiting" },
    "qrCode": {
      "contentType": "image/png",
      "imageDataUrl": "data:image/png;base64,...",
      "containsPatientData": false
    }
  }
}
```

**Business Rules:**
- Phone number must be unique per clinic (409 CONFLICT if duplicate)
- The first visit is placed in the selected doctor's daily queue
- QR is generated from a random opaque token and contains no patient data

---

#### GET /api/v1/patients
**Description:** Paginated list of clinic patients
**Auth required:** Yes | **Minimum role:** receptionist
**Query Params:** `?page=1&limit=20&search=Priya%20Mehta&match=exact&doctorId=xxx`

**Repeat-visit search rules:**
- Exact normalized full-name matching is the default; `match=prefix` is available for suggestions
- Duplicate full names are allowed and returned separately with masked phone, age, and gender
- Search responses exclude full phone numbers and clinical complaint data
- Search terms are never written to audit metadata

---

#### POST /api/v1/patients/:id/check-ins
**Description:** Add an existing patient to today's doctor queue without resubmitting their registration form
**Auth required:** Yes | **Minimum role:** receptionist

**Request Body:** `{}` to reuse the assigned doctor, or `{ "doctorId": "..." }` to route to another doctor in the clinic.

**Business Rules:**
- One queue entry per patient per clinic day
- At most one active (`waiting` or `in_consultation`) entry per patient across all clinic days
- Daily queue numbers are allocated atomically per doctor and are never reassigned
- Concurrent check-in attempts produce at most one successful queue entry
- Cross-clinic patients and doctors return 404
- Patient demographics and existing clinical documentation are not changed

---

#### GET /api/v1/patients/queue
**Description:** Get the number-wise daily doctor queue
**Auth required:** Yes | **Minimum role:** receptionist
**Query Params:** `?date=2026-08-01&doctorId=xxx&status=waiting&page=1&limit=20`

Doctors are always restricted to their own queue. The response uses top-level `data` and `pagination`. Queue status follows `waiting → in_consultation → completed`, with cancellation permitted before completion.

---

#### GET /api/v1/patients/:id — F13
**Description:** Patient profile with implemented visit-queue/check-in history
**Auth required:** Yes | **Minimum role:** receptionist
**Query Params:** `?page=1&limit=20` for visit history

**Response — 200 OK:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "Priya Mehta",
    "totalVisits": 5,
    "lastVisitDate": "2026-07-10T00:00:00.000Z",
    "visitHistory": [...],
    "visitPagination": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
  }
}
```

---

Prescription history is retrieved separately through `GET /api/v1/prescriptions?patientId=:patientId`. Appointment aggregation and PDF links are planned.

---

#### GET /api/v1/patients/:patientId/qr — F10
**Description:** Regenerate the patient's QR PNG from the encrypted opaque token
**Auth required:** Yes | **Minimum role:** receptionist

---

#### GET /api/v1/patients/qr/:qrToken — F10
**Description:** Resolve an opaque QR token to the clinic-owned patient
**Auth required:** Yes | **Minimum role:** receptionist

---

#### POST /api/v1/patients/:patientId/qr/rotate — F10
**Description:** Revoke the prior QR token and issue a replacement
**Auth required:** Yes | **Minimum role:** admin

---

#### PATCH /api/v1/patients/queue/:queueEntryId/status
**Description:** Advance or cancel a daily queue entry using validated state transitions
**Auth required:** Yes | **Minimum role:** receptionist; doctors may update only their own queue

---

#### DELETE /api/v1/patients/:patientId
**Description:** Soft-delete a clinic patient
**Auth required:** Yes | **Minimum role:** admin

---

#### GET /api/v1/patients/dropout — F15
**Status:** **Planned — not implemented.**
**Description:** List all overdue patients sorted by days overdue
**Auth required:** Yes | **Minimum role:** doctor

**Response — 200 OK:**
```json
{
  "success": true,
  "data": [
    {
      "patient": { "_id": "...", "name": "Priya Mehta", "diagnosis": "Diabetes Type 2" },
      "daysOverdue": 32,
      "dropoutStatus": "overdue_30",
      "lastDropoutMessageSentAt": null
    }
  ]
}
```

---

#### POST /api/v1/patients/:id/dropout-message — F15
**Status:** **Planned — not implemented.**
**Description:** Send AI-personalized re-engagement WhatsApp message
**Auth required:** Yes | **Minimum role:** doctor

**Response — 200 OK:**
```json
{
  "success": true,
  "data": {
    "messageSent": true,
    "messagePreview": "Hi Priya, Dr. Sharma here. We noticed you haven't visited in 32 days..."
  }
}
```

**Business Rules:**
- Requires AI API key configured (422 AI_NOT_CONFIGURED otherwise)
- Minimum 48 hours between messages to same patient
- `lastDropoutMessageSentAt` updated on send

---

### Prescription Routes

#### POST /api/v1/prescriptions — F02, F03
**Description:** Finalize a manual, doctor-authored prescription and complete its active consultation. After the clinical transaction succeeds, communications independently queues a generic prescription-ready template when consent and configuration permit.
**Auth required:** Yes | **Minimum role:** doctor

**Request Body:**
```json
{
  "patientId": "64a...",
  "queueEntryId": "64b...",
  "diagnosis": "Viral fever with pharyngitis",
  "doctorNotes": "Avoid cold foods. Rest for 2 days.",
  "medicines": [
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "5 days",
      "instructions": "After food"
    }
  ],
  "clinicianConfirmed": true
}
```

**Response — 201 Created:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "deliveryStatus": "pending",
    "qrCode": { "contentType": "image/png", "containsPatientData": false },
    "delivery": { "status": "pending", "reason": "Provider delivery is reported only by a verified webhook" }
  }
}
```

**Business Rules:**
- Manual prescription creation requires `clinicianConfirmed: true`
- Queue visit must be `in_consultation`, belong to the patient, and belong to the authenticated doctor
- Prescription creation, queue completion, patient visit count, and QR issuance are one MongoDB transaction
- QR contains only an opaque random token; it never embeds patient or prescription details
- A notification queue failure never rolls back the finalized prescription; provider delivery remains pending until a verified webhook advances it
- Voice and template sources require their own clinician-reviewed endpoints

---

#### GET /api/v1/prescriptions?patientId=:patientId
**Description:** List a clinic patient's prescriptions in reverse visit order
**Auth required:** Yes | **Roles:** doctor, admin

Receptionists are deliberately forbidden. Patient and prescription lookups are clinic-scoped, so a foreign-clinic identifier resolves as not found.

---

#### GET /api/v1/prescriptions/:prescriptionId
**Description:** Read one clinic-owned prescription
**Auth required:** Yes | **Roles:** doctor, admin

---

#### POST /api/v1/prescriptions/voice — F09
**Status:** **Planned — not implemented.**
**Description:** Convert spoken transcript to structured prescription via AI
**Auth required:** Yes | **Minimum role:** doctor

**Request Body:**
```json
{
  "patientId": "64a...",
  "voiceTranscript": "paracetamol five hundred mg twice daily for five days after food..."
}
```

**Response — 200 OK:**
```json
{
  "success": true,
  "data": {
    "structured": {
      "diagnosis": "Viral fever",
      "medicines": [
        { "name": "Paracetamol", "dosage": "500mg", "frequency": "Twice daily", "duration": "5 days", "instructions": "After food" }
      ]
    },
    "rawTranscript": "paracetamol five hundred mg..."
  }
}
```

**Business Rules:**
- Returns 422 `AI_NOT_CONFIGURED` if no AI key set
- Does NOT auto-send — doctor reviews then calls POST /api/v1/prescriptions

---

#### POST /api/v1/prescriptions/from-template — F08
**Status:** **Planned — not implemented.**
**Description:** Create prescription from saved template (one-tap)
**Auth required:** Yes | **Minimum role:** doctor

**Request Body:**
```json
{
  "patientId": "64a...",
  "templateId": "64c...",
  "overrides": { "diagnosis": "Modified diagnosis if needed" }
}
```

---

### Appointment Routes

**Status:** **Partial.** Local scheduling plus consent-gated approved-template confirmations/reminders and signed delivery tracking are implemented. No-show scoring and rebooking are not implemented.

#### POST /api/v1/appointments — F04
**Description:** Create a clinic-scoped appointment. After the appointment transaction succeeds, communications independently queues consent-gated confirmation and eligible reminder jobs. No-show scoring is not part of this endpoint.
**Auth required:** Yes | **Minimum role:** receptionist

**Request Body:**
```json
{
  "patientId": "64a...",
  "doctorId": "64b...",
  "scheduledAt": "2026-08-05T10:30:00.000Z",
  "durationMinutes": 15
}
```

**Response — 201 Created:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "scheduledAt": "2026-08-05T10:30:00.000Z",
    "status": "pending",
    "durationMinutes": 15
  }
}
```

**Business Rules:**
- Verifies the patient and active doctor belong to the authenticated clinic
- Validates the future appointment falls within configured working hours and outside the configured break
- Returns 409 `DOUBLE_BOOKING` if exact time taken
- Records a metadata-only audit event; does not send WhatsApp or calculate no-show risk

---

#### GET /api/v1/appointments/board — F07
**Description:** Today's appointment board for live status view
**Auth required:** Yes | **Minimum role:** receptionist
**Query Params:** `?date=2026-08-05&doctorId=xxx`

**Response — 200 OK:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "patient": { "name": "Priya Mehta", "phone": "+91..." },
      "doctor": { "name": "Dr. Ramesh Sharma" },
      "scheduledAt": "2026-08-05T10:30:00.000Z",
      "status": "confirmed",
      "noShowRisk": "low"
    }
  ]
}
```

---

#### GET /api/v1/appointments/slots — F11
**Description:** Get available time slots for a doctor on a given date
**Auth required:** Yes
**Query Params:** `?doctorId=xxx&date=2026-08-05`

**Response — 200 OK:**
```json
{
  "success": true,
  "data": {
    "available": ["09:00", "09:15", "09:30", "10:00"],
    "booked": ["09:45", "10:15"],
    "booked": ["09:45", "10:15"]
  }
}
```

---

#### PATCH /api/v1/appointments/:id/status
**Description:** Manually update appointment status
**Auth required:** Yes | **Minimum role:** receptionist

**Request Body:**
```json
{ "status": "completed" }
```

---

#### POST /api/v1/appointments/:id/rebook — F12
**Description:** Rebook chronic patient 30 days ahead
**Auth required:** Yes | **Minimum role:** doctor

**Response — 201 Created:**
```json
{
  "success": true,
  "data": {
    "newAppointmentId": "...",
    "scheduledAt": "2026-09-05T10:30:00.000Z",
    "whatsappConfirmationSent": true
  }
}
```

---

### Template Routes — F08

**Status:** **Planned — no template endpoints currently exist.**

#### POST /api/v1/templates
**Description:** Create reusable prescription template
**Auth required:** Yes | **Minimum role:** doctor

**Request Body:**
```json
{
  "name": "Fever + Cold",
  "diagnosis": "Acute viral fever with upper respiratory tract infection",
  "medicines": [...],
  "doctorNotes": "Rest. Fluids. Avoid cold foods."
}
```

---

#### GET /api/v1/templates
**Description:** List all templates for logged-in doctor (sorted by usageCount)
**Auth required:** Yes | **Minimum role:** doctor

---

#### PATCH /api/v1/templates/:id
**Description:** Update a template
**Auth required:** Yes | **Minimum role:** doctor

---

#### DELETE /api/v1/templates/:id
**Description:** Soft-delete a template
**Auth required:** Yes | **Minimum role:** doctor

---

### Analytics Routes — F19

**Status:** **Planned — no analytics endpoints currently exist.**

#### GET /api/v1/analytics/summary
**Description:** Clinic intelligence dashboard data
**Auth required:** Yes | **Minimum role:** doctor

**Response — 200 OK:**
```json
{
  "success": true,
  "data": {
    "prescriptions": { "today": 12, "thisMonth": 187 },
    "appointments": {
      "confirmed": 8,
      "cancelled": 2,
      "missed": 1,
      "noShowRate": "11.1%"
    },
    "dropout": {
      "totalOverdue": 23,
      "recovered": 5,
      "recoveryRate": "21.7%",
      "revenueRecoveredEstimate": 15000
    },
    "satisfaction": { "averageScore": 4.3 },
    "peakHours": [
      { "hour": "10:00", "count": 8 },
      { "hour": "11:00", "count": 6 }
    ],
    "topMedicines": [
      { "name": "Paracetamol", "count": 45 }
    ]
  }
}
```

---

### WhatsApp Webhook

**Status:** **Planned — no WhatsApp adapter or webhook currently exists.**

#### POST /api/v1/whatsapp/webhook
**Description:** Receive incoming WhatsApp messages from patients
**Auth required:** No (verified by WHATSAPP_VERIFY_TOKEN HMAC)

**Handles:**
- `CONFIRM` / `RESCHEDULE` / `CANCEL` → updates appointment status
- `1`–`5` → stores feedback rating (F18)
- Delivery status updates → updates prescription `deliveryStatus`

**Socket.io Event Emitted:**
```json
{
  "event": "appointment:statusUpdate",
  "room": "clinic:{clinicId}",
  "data": { "appointmentId": "...", "status": "confirmed" }
}
```

---

### Clinic Settings Routes

**Status:** **Implemented.** All three routes require an authenticated admin, a password-ready account, and a TOTP-verified admin session.

#### GET /api/v1/clinic/me
**Description:** Get current clinic settings
**Auth required:** Yes | **Minimum role:** admin

---

#### PATCH /api/v1/clinic/me
**Description:** Update clinic settings (name, address, logo, working hours, slot config)
**Auth required:** Yes | **Minimum role:** admin

---

#### PATCH /api/v1/clinic/me/ai-config
**Description:** Set AI API key (encrypted before storage)
**Auth required:** Yes | **Minimum role:** admin

**Request Body:**
```json
{
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "modelName": "gpt-4o",
  "apiKey": "sk-..."
}
```

---

### Multi-Doctor Routes — F20

**Status:** **Planned as written below.** Current staff creation and listing use `/api/v1/auth/staff`; doctor profile fields, email delivery, and `/api/v1/clinic/doctors` do not exist.

#### GET /api/v1/clinic/doctors
**Description:** List all doctors in the clinic
**Auth required:** Yes | **Minimum role:** admin

---

#### POST /api/v1/clinic/doctors
**Description:** Add a new doctor to the clinic
**Auth required:** Yes | **Minimum role:** admin

**Request Body:**
```json
{
  "name": "Dr. Priya Iyer",
  "email": "priya@sharma-clinic.com",
  "specialization": "General Physician",
  "registrationNumber": "MH-12345",
  "phone": "+919876543211"
}
```

**Business Rules:**
- System generates temporary password
- Sends login credentials to doctor's email
- Doctor must change password on first login

---

## 9. Feature Specifications

### F01 — Patient Registration

**Backend status:** **Implemented.** This includes the new returning-patient search and number-wise daily doctor queue.

**Actor:** Receptionist / Doctor | **Trigger:** New patient arrives

**Fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| name | String | Yes | Full name |
| phone | String | Yes | WhatsApp number with country code |
| age | Number | Yes | 1–120 |
| gender | Enum | Yes | male / female / other |
| bloodGroup | String | No | A+, B+, O+, etc. |
| chiefComplaint | String | Yes | Reason for visit |
| assignedDoctorId | ObjectId | Yes | Which doctor |

**Flow:**
1. Receptionist fills form on dashboard
2. System checks phone uniqueness per clinic
3. QR code auto-generated (F10)
4. Patient profile created instantly
5. Patient visible on doctor's queue immediately

**Returning-patient flow:**
1. Receptionist searches the patient's normalized full name
2. Duplicate names are distinguished using masked phone, age, and gender
3. Receptionist selects the existing patient ID; no registration or clinical form is resubmitted
4. System assigns the next daily number in the selected doctor's queue
5. Same-day duplicate check-in is rejected

---

### F02 — Digital Prescription Writer

**Backend status:** **Partial.** The manual, clinician-confirmed save operation is implemented; PDF, WhatsApp, templates, and voice input are pending.

**Actor:** Doctor | **Trigger:** Doctor opens patient profile

**Fields:**
| Field | Type | Required |
|---|---|---|
| diagnosis | String | Yes |
| medicines[].name | String | Yes |
| medicines[].dosage | String | Yes |
| medicines[].frequency | String | Yes |
| medicines[].duration | String | Yes |
| medicines[].instructions | String | No |
| doctorNotes | String | No |

**Implemented flow:**
1. Doctor opens patient profile
2. Doctor moves their queue entry to `in_consultation`
3. Doctor authors the diagnosis and medicine fields and explicitly confirms review
4. A transaction saves one final prescription, completes the queue visit, updates visit totals, and issues the patient's opaque QR
5. A generic, consent-gated prescription-ready notification may be queued; it contains no diagnosis, medicine, notes, or PDF, and external delivery remains unconfirmed until a signed provider webhook

Template and voice assistance must never bypass clinician review or autonomously diagnose, prescribe, dose, treat, or change medication.

---

### F03 — Instant WhatsApp Prescription Delivery

**Backend status:** **Partial.** Consent-gated approved-template prescription-ready notifications, retry/dead-letter handling, and signed status webhooks are implemented. PDF attachment delivery is intentionally not implemented.

**Actor:** System (automatic) | **SLA:** < 3 seconds

**WhatsApp Message:**
```
Hi {patient_name}, your prescription is ready. Please contact or visit {clinic_name} through the clinic's approved channel to access it.
```

**Delivery Status Flow:**
```
queued → accepted → sent → delivered → read
   ↓          ↓
retry_scheduled → failed/dead_letter + reception alert
```

---

### F04 — Appointment Setter

**Backend status:** **Partial.** Clinic-scoped creation and consent-gated approved-template confirmation jobs are implemented; the dedicated appointment board UI remains pending.

**Actor:** Doctor / Receptionist

**WhatsApp Confirmation:**
```
Hi {patient_name}! Your appointment is confirmed.

Doctor: Dr. {doctor_name}
Clinic: {clinic_name}
Date: {date}
Time: {time}
Address: {clinic_address}

Reply CONFIRM to confirm or RESCHEDULE if needed.
```

---

### F05 — Auto Reminder System

**Backend status:** **Implemented backend.** Persisted 24-hour and 2-hour jobs use idempotency keys, leases, consent re-checks, bounded 1-minute/5-minute/30-minute backoff, and dead-letter reception alerts.

**Actor:** System (cron job every 15 minutes)

| Reminder | When | Contains |
|---|---|---|
| First | 24 hours before | Appointment details + CONFIRM/RESCHEDULE |
| Second | 2 hours before | Final reminder + CONFIRM/RESCHEDULE |

---

### F06 — Patient Reply Tracker

**Backend status:** **Implemented.** Signed, idempotent webhook handling records replies and alerts reception. CONFIRM and CANCEL update an active linked appointment; RESCHEDULE and other text are surfaced for human follow-up.

**Reply Handling:**
| Reply | Action | Dashboard |
|---|---|---|
| `CONFIRM` | Status → confirmed | Green badge |
| `RESCHEDULE` | Leave scheduling unchanged; alert receptionist for human follow-up | Yellow badge + alert |
| `CANCEL` | Status → cancelled + slot freed | Red badge |
| Other text | Store as a reply and alert reception; do not infer a clinical or scheduling action | Reply alert |

---

### F07 — Appointment Status Board

**Backend status:** **Not started.** The current number-wise visit queue is implemented, but it is separate from appointments and has no Socket.IO layer.

**Board Columns:** Confirmed | Pending | Rescheduled | Cancelled | Completed

**Each Card Shows:**
- Patient name + appointment time
- Doctor name
- Status badge (color-coded)
- No-show risk badge: LOW / MEDIUM / HIGH (F16)

**Real-time:** Socket.io room `clinic:{clinicId}` — updates pushed instantly when patient replies.

---

### F08 — One-Tap Prescription Templates

**Backend status:** **Not started.** Templates must be doctor-owned, clinic-scoped, and reviewed/edited for the individual patient before finalization.

**Flow:**
1. Doctor clicks "+ Template" on prescription screen
2. Selects template (sorted by usage count)
3. All medicine fields auto-filled
4. Doctor edits patient-specific values
5. Saves normally

**Template Examples:** Fever + Cold, BP Review, Diabetes Follow-up, Acidity, Vitamin Deficiency, Thyroid Check

---

### F09 — Voice Prescription Input (AI)

**Backend status:** **Not started.** AI output must be structured, schema-validated, safely logged, and presented as an editable draft requiring clinician confirmation; it must never auto-save or auto-send.

**Technology:** Web Speech API → raw text → AI API → structured prescription

**AI Prompt:**
```
You are a medical prescription parser. Extract:
- Diagnosis
- For each medicine: name, dosage, frequency, duration, instructions

Dictated text: "{voiceTranscript}"

Return JSON: { diagnosis, medicines: [...] }
```

**Flow:**
1. Doctor clicks mic → browser captures voice → transcript in text box
2. Doctor clicks "Structure with AI"
3. AI structures the transcript
4. Doctor reviews → clicks "Save & Send"

**Fallback:** If AI unavailable, doctor fills form manually from transcript.

---

### F10 — QR Code Patient Check-In

**Backend status:** **Partial.** Opaque token creation, encrypted-at-rest regeneration, PNG output, clinic-scoped resolution, and admin rotation are implemented. Public self-check-in, private stored QR documents, and delivery are pending.

**Flow:**
1. Patient presents or scans their QR code
2. QR contains `${CLIENT_URL}/checkin/{opaqueRandomToken}` — never a patient ID or patient data
3. Authenticated clinic staff resolve the hashed token within their own clinic
4. A limited identity summary with masked phone is shown for confirmation
5. Staff check in the selected patient; no registration form is re-entered

**QR Generation (on patient registration):**
```typescript
const token = crypto.randomBytes(32).toString('base64url');
const qrData = `${env.CLIENT_URL}/checkin/${token}`;
const qrImageBuffer = await QRCode.toBuffer(qrData, { width: 300 });
// Store SHA-256(token) for lookup and an AES-256-GCM encrypted token for regeneration.
// Private object storage and QR-document delivery are implemented in later milestones.
```

---

### F11 — Smart Slot Management

**Backend status:** **Not started.** Clinic working-hour and capacity settings exist, but appointment slot calculation/conflict protection does not.

**Doctor Configuration:**
```json
{
  "workingHours": { "start": "09:00", "end": "18:00" },
  "breakStart": "13:00",
  "breakEnd": "14:00",
  "maxPatientsPerHour": 4,
  "slotDurationMinutes": 15
}
```

**Slot Check Before Every Appointment Creation:**
```typescript
const existingCount = await Appointment.countDocuments({
  doctorId, clinicId,
  scheduledAt: { $gte: slotStart, $lt: slotEnd },
  status: { $nin: ['cancelled', 'no_show'] }
});
if (existingCount >= maxPatientsPerHour) {
  throw new AppError('SLOT_FULL', 400);
}
```

---

### F12 — One-Tap Rebooking

**Backend status:** **Not started.**

**Flow:**
1. Doctor clicks "Rebook in 30 days" on appointment completion
2. System creates appointment exactly 30 days forward at same time
3. Checks slot availability (F11)
4. WhatsApp confirmation sent instantly

---

### F13 — Patient Visit History

**Backend status:** **Partial.** Queue/check-in history plus role-restricted prescription reads exist. Appointment history and private PDF access are pending.

**Data Shown:**
- Total visit count
- All past prescriptions (with PDF download)
- All appointments with status history
- Next scheduled appointment
- Days since last visit

---

### F15 — Patient Dropout Radar (AI)

**Backend status:** **Not started.** No automated clinical recommendation is permitted; generated outreach must use approved, non-diagnostic templates or clinician-reviewed text and safe fallbacks.

**Cron:** Daily at 9:00 AM IST

**Classification:**
| Days Overdue | Status | Message Tone |
|---|---|---|
| 7 days | `overdue_7` | Gentle reminder |
| 14 days | `overdue_14` | Concerned check-in |
| 30 days | `overdue_30` | Urgent follow-up |
| 60 days | `overdue_60` | Final outreach |

**AI Variables:** `{patient_name}`, `{doctor_name}`, `{clinic_name}`, `{diagnosis}`, `{days_overdue}`

**Dashboard Tracking:** Sent / Replied / Booked / Revenue recovered estimate

---

### F16 — No-Show Predictor (Local ML)

**Backend status:** **Not started.** It must be feature-gated and must degrade safely without blocking care or appointment creation.

**Technology:** scikit-learn Random Forest (Python microservice)
**No external AI API key required**

**Input Features:**

| Feature | Type |
|---|---|
| past_noshow_rate | Float |
| day_of_week | Int (0=Mon, 6=Sun) |
| hour_of_day | Int |
| diagnosis_type | Encoded int |
| age | Int |
| days_since_last_visit | Int |
| reminder_confirmed | Bool |

**Risk Thresholds:**
- `score < 0.3` → LOW (green)
- `0.3 ≤ score < 0.6` → MEDIUM (yellow)
- `score ≥ 0.6` → HIGH (red)

---

### F18 — Post Visit Feedback

**Backend status:** **Not started.**

**Trigger:** 2 hours after appointment marked `completed`

**Flow:**
1. System sends: "Rate your visit 1-5 ⭐"
2. Patient replies with 1–5
3. Rating 5 → Google Review link sent automatically
4. Rating ≤ 3 → Silent dashboard alert to doctor
5. Data stored for analytics (F19)

---

### F19 — Clinic Intelligence Dashboard

**Backend status:** **Not started.**

**Metrics:**
| Metric | Source |
|---|---|
| Prescriptions today / this month | Prescription collection |
| Confirmed vs cancelled % | Appointment collection |
| No-show rate | Appointment collection |
| Dropout recovery rate | Patient collection |
| Revenue recovered estimate | Dropout + avg consultation fee |
| Avg satisfaction score | Feedback collection |
| Peak hours chart | Appointment collection |
| Top 10 medicines | Prescription.medicines aggregation |

**Refresh:** TanStack Query `staleTime: 5 minutes`

---

### F20 — Multi Doctor Support

**Backend status:** **Partial.** Doctor accounts and per-doctor queues exist. Doctor profiles, schedules, templates, appointment ownership, and comparative analytics are pending.

**Each Doctor Has:**
- Own login credentials
- Own patient list
- Own appointment schedule
- Own prescription templates
- Own working hours and slot configuration

**Admin View:**
- All doctors in unified dashboard
- Compare: appointment counts, no-show rates, satisfaction scores
- Manage billing for entire clinic from single account

---

## 10. WhatsApp Integration

> **Implementation status:** **Implemented for consent-led utility notifications.** RxFlow now has clinic-scoped Cloud API and development-sandbox adapters, encrypted write-only secrets, approved-template metadata, explicit patient consent, durable confirmation/reminder/prescription-ready jobs, signed and idempotent webhooks, delivery timelines, patient replies, bounded retries, dead-letter handling, and reception alerts. Prescription PDFs, free-form outbound chat, feedback, campaigns, and production provider credentials remain outside this milestone.

### Verified current Meta requirements (2026-08-02)

- Graph API **v26.0** is the current version; the clinic configuration stores the version explicitly so future upgrades are deliberate.
- Business-initiated notifications use templates whose Meta status is `APPROVED`; this release accepts only `utility` templates and refuses other statuses.
- A patient must have supplied the phone number and explicitly opted in for the relevant `appointments` and/or `prescription_ready` category. Opt-out cancels pending work and is checked again at send time.
- Meta webhook verification echoes `hub.challenge` only after a timing-safe verify-token comparison. POST requests use the exact raw body with `X-Hub-Signature-256: sha256=...` and the clinic's decrypted app secret.
- The `messages` webhook carries inbound replies and asynchronous `sent`, `delivered`, `read`, and `failed` status events. Events are deduplicated because Meta retries unacknowledged webhook deliveries for up to seven days.
- A successful Cloud API send response is recorded only as `accepted`; delivery is never inferred. The sandbox records `sandbox_recorded` and is prohibited in production.

Authoritative references: [Meta webhook endpoint requirements](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint), [messages webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages), [template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview), [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/), and [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/).

### Message Types

| Type | Used For |
|---|---|
| Utility template | Generic prescription-ready notification (F03); never diagnosis, medicine, notes, or prescription content |
| Text Template | Appointment confirmation (F04) |
| Text Template | Reminders 24h + 2h (F05) |
| Text Template | Feedback request (F18) |
| Text Template | Dropout re-engagement (F15) |
| Text | Google Review link (F18) |

> All implemented outbound messages use pre-approved utility templates. RxFlow does not send diagnosis or unnecessary clinical detail through WhatsApp.

### Adapter and delivery design

`WhatsAppAdapter` has two implementations. `CloudWhatsAppAdapter` sends named or positional template parameters to `/{apiVersion}/{phoneNumberId}/messages` with a bearer system-user token. `SandboxWhatsAppAdapter` stores only a local `sandbox_recorded` event, clearly labels itself, never creates a provider message ID, and never reports sent, delivered, or read.

Durable `CommunicationJob` records are claimed with a lease. Retryable transport, rate-limit, and server failures use delays of 1 minute, 5 minutes, and 30 minutes, with four total attempts. Permanent failures or exhausted retries become `dead_letter` and create a reception alert. Consent and template approval are rechecked immediately before every adapter call.

The status model is `queued → accepted → sent → delivered → read`, with independent terminal `failed`, `dead_letter`, and inbound `replied` events. Out-of-order webhooks cannot downgrade an achieved delivery state.

---

## 11. AI Integration

> **Implementation status:** **Doctor-reviewed assistance implemented.** Encrypted clinic provider configuration, clinic/global feature controls, provider abstraction, structured prescription drafting, bounded history summaries, clinician rejection, retry/timeout/cancellation fallbacks, content-free cost/latency records, and safety evaluations are implemented. Voice transcription, autonomous diagnosis, prescription finalization, queue mutation, and automatic patient messaging are not implemented.

The implemented endpoints are `POST /api/v1/ai/prescription-assist`, `POST /api/v1/ai/history-summary`, `POST /api/v1/ai/runs/:runId/reject`, and admin-only `PATCH /api/v1/clinic/me/ai-controls`. All clinical assistance routes enforce the doctor role, clinic ownership, and assigned-doctor patient access on the backend. Every result is labelled **AI-generated draft**, exposes its bounded context sources, and requires the doctor to apply, review, and separately confirm the prescription through the existing prescription workflow.

Prompts delimit all doctor/patient material as untrusted data and instruct providers not to follow embedded instructions. Output must pass a strict schema and rejects extra/malformed fields and unsupported certainty. Audit and run records contain only operational metadata—never prompts, clinical inputs/outputs, patient details, prescription contents, provider secrets, or authentication material. Synthetic evaluation fixtures cover malformed output, unsafe certainty, missing context, prompt injection, provider failure, and clinician rejection.

### Provider-Agnostic Design

```typescript
// src/services/ai.service.ts
export class AIService {

  private async getConfig(clinicId: string) {
    const clinic = await Clinic.findById(clinicId);
    if (!clinic.aiConfig.isConfigured) {
      throw new AppError('AI_NOT_CONFIGURED', 422);
    }
    const apiKey = decrypt(clinic.aiConfig.encryptedApiKey);
    return { baseURL: clinic.aiConfig.baseUrl, model: clinic.aiConfig.modelName, apiKey };
  }

  async structurePrescription(clinicId: string, transcript: string): Promise<StructuredPrescription> {
    const config = await this.getConfig(clinicId);
    const response = await axios.post(
      `${config.baseURL}/chat/completions`,
      {
        model: config.model,
        messages: [
          { role: 'system', content: PRESCRIPTION_PARSER_PROMPT },
          { role: 'user', content: transcript }
        ]
      },
      { headers: { Authorization: `Bearer ${config.apiKey}` } }
    );
    return JSON.parse(response.data.choices[0].message.content);
  }

  async generateDropoutMessage(clinicId: string, patient: PatientData): Promise<string> {
    // Generate tone-appropriate re-engagement message based on daysOverdue
  }
}
```

### API Key Storage (AES-256-GCM)

```typescript
// Admin sets AI key in Settings panel
const encrypted = encrypt(apiKey, env.ENCRYPTION_KEY);
await Clinic.findByIdAndUpdate(clinicId, {
  'aiConfig.encryptedApiKey': encrypted,
  'aiConfig.provider': provider,
  'aiConfig.baseUrl': baseUrl,
  'aiConfig.modelName': modelName,
  'aiConfig.isConfigured': true
});
```

---

## 12. ML — No-Show Predictor

> **Implementation status:** **Not started.** The service must be feature-gated and unavailable predictions must never block patient care.

### Python Microservice (FastAPI)

```python
# ml/predict.py
from fastapi import FastAPI
from pydantic import BaseModel
import joblib, numpy as np

app = FastAPI()
model = joblib.load("model.pkl")

class AppointmentFeatures(BaseModel):
    past_noshow_rate: float
    day_of_week: int
    hour_of_day: int
    diagnosis_type: int
    age: int
    days_since_last_visit: int
    reminder_confirmed: bool

@app.post("/predict")
def predict(features: AppointmentFeatures):
    X = np.array([[
        features.past_noshow_rate, features.day_of_week,
        features.hour_of_day, features.diagnosis_type,
        features.age, features.days_since_last_visit,
        int(features.reminder_confirmed)
    ]])
    score = float(model.predict_proba(X)[0][1])
    risk = "high" if score >= 0.6 else "medium" if score >= 0.3 else "low"
    return { "risk": risk, "score": round(score, 3) }
```

### Node.js → ML Call

```typescript
// src/services/ml.service.ts
export async function getNoShowRisk(features: AppointmentFeatures) {
  try {
    const { data } = await axios.post(`${env.ML_SERVICE_URL}/predict`, features);
    return data;
  } catch {
    // ML unavailable — default low risk, never block appointment creation
    return { risk: 'low', score: 0 };
  }
}
```

---

## 13. Frontend Architecture

> **Implementation status:** **Foundation implemented.** The React/Vite application includes public clinic and staff login, protected role-aware dashboards, staff first-sign-in password replacement, paginated patient search and visit history, masked returning-patient confirmation, role-specific daily queue controls, authenticated QR display/download/resolution/admin rotation, patient/queue/prescription flows, and explicit loading, empty, recoverable error, forbidden, offline, and expired-session handling. Later product routes shown below remain targets unless present in the current router.

### Route Structure

```typescript
// src/App.tsx
<Routes>
  {/* Public */}
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/checkin/:qrCode" element={<QRCheckin />} />

  {/* Protected */}
  <Route element={<RequireAuth />}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/patients" element={<Patients />} />
    <Route path="/patients/:id" element={<PatientProfile />} />
    <Route path="/patients/:id/prescription/new" element={<NewPrescription />} />
    <Route path="/appointments" element={<AppointmentBoard />} />

    {/* Doctor + Admin */}
    <Route element={<RoleGuard roles={['doctor', 'admin']} />}>
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/dropout" element={<DropoutRadar />} />
    </Route>

    {/* Admin only */}
    <Route element={<RoleGuard roles={['admin']} />}>
      <Route path="/settings" element={<Settings />} />
      <Route path="/settings/doctors" element={<ManageDoctors />} />
      <Route path="/settings/billing" element={<Billing />} />
    </Route>
  </Route>
</Routes>
```

### Axios Client

```typescript
// src/lib/api/client.ts — Single-flight refresh on 401
export const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL + '/api/v1',
  withCredentials: true,
  timeout: 10_000,
});

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh interceptor with queue — prevents duplicate refresh calls
let isRefreshing = false;
let refreshQueue: Array<{ resolve: Function; reject: Function }> = [];

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 &&
        error.response?.data?.error?.code === 'TOKEN_EXPIRED' &&
        !original._retry) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        });
      }
      isRefreshing = true;
      try {
        const { data } = await refreshClient.post('/auth/refresh');
        tokenStore.set(data.data.accessToken);
        refreshQueue.forEach(p => p.resolve(data.data.accessToken));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return client(original);
      } catch {
        refreshQueue.forEach(p => p.reject());
        refreshQueue = [];
        tokenStore.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

### Socket.io Client

```typescript
// src/lib/socket.ts
import { io } from 'socket.io-client';
import { tokenStore } from '../auth/tokenStore';

export const socket = io(import.meta.env.VITE_API_BASE_URL, {
  autoConnect: false,
  auth: { token: tokenStore.get() }
});

socket.on('appointment:statusUpdate', (data) => {
  queryClient.invalidateQueries({ queryKey: ['appointments', 'board'] });
});
```

### Token Store (Memory Only)

```typescript
// src/auth/tokenStore.ts — NEVER localStorage or sessionStorage
let _token: string | null = null;
export const tokenStore = {
  get: () => _token,
  set: (t: string) => { _token = t; },
  clear: () => { _token = null; },
};
```

---

## 14. Security Checklist

Checked items are verified in the current backend implementation or test suite. Unchecked items remain required work or production-environment verification.

### Environment & Configuration
- [x] No application secrets are hardcoded in source; local secrets are environment-provided
- [x] `.env` and `.env.*` are ignored, with `.env.example` explicitly allowed
- [x] Current environment contract is validated with Zod at startup
- [x] JWT secrets must each be at least 64 characters; example/configuration requires them to be different
- [x] `ENCRYPTION_KEY` must be 32 bytes represented by 64 hexadecimal characters
- [ ] MongoDB Atlas IP allowlist — only backend server IPs
- [x] Configured AI API keys and TOTP secrets are encrypted with AES-256-GCM before database storage

### Authentication
- [x] Access tokens are 15 minutes and refresh sessions/tokens are limited to 7 days
- [x] Access tokens use the `Authorization: Bearer` header and are never accepted in URLs
- [x] Refresh cookie is `HttpOnly` and `SameSite=Strict`; `Secure` is required in production and configurable only for local/test HTTP
- [x] Refresh tokens are bcrypt-hashed in the separate `AuthSession` collection
- [x] Refresh credentials rotate on every successful `/auth/refresh`; replay revokes the compromised session
- [x] One active device session per user is enforced
- [x] Account lockout occurs after five failed logins for 15 minutes
- [x] Active signup/login/recovery browser flows are password-only and never require or redirect through MFA
- [x] Password-reset tokens are random, SHA-256 hashed at rest, single-use, short-lived, superseded by new requests, and omitted from production responses/audit metadata
- [x] Password reset and administrator disable actions revoke affected user sessions; disabled users are rejected server-side

### API Security
- [x] `helmet()` is enabled and `x-powered-by` is disabled
- [x] Credentialed CORS uses an explicit origin list
- [ ] `express-mongo-sanitize()` in middleware chain
- [x] Global rate limits and stricter login/signup limits are enabled
- [x] `express.json({ limit: '10kb' })` is enabled
- [x] Current request bodies, parameters, and queries use strict Zod validation where input is accepted
- [x] Current patient, queue, prescription, clinic, and staff access is clinic-scoped and cross-clinic cases are tested
- [ ] WhatsApp webhook verified by HMAC signature before processing

### Data & Privacy
- [x] Passwords are hashed with bcrypt cost 12
- [x] AI API keys are encrypted before database storage and excluded from normal queries
- [x] Pino HTTP logs redact URL, query, parameters, headers, client network fields, and response headers
- [x] QR codes contain a random opaque token only; lookup hashes and encrypted regeneration material are stored instead of plaintext tokens
- [x] Current clinical and security mutations create clinic-scoped audit records without search terms or secret values
- [ ] Sentry configured with PII scrubbing in `beforeSend`
- [x] `.pkl` artifacts are ignored; no ML model currently exists
- [ ] Private document storage with authorization-checked access and expiring URLs

### Infrastructure
- [x] `GET /health` liveness and `GET /ready` MongoDB readiness are implemented
- [x] `npm audit --audit-level=high` reports zero high/critical vulnerabilities as of 2026-08-02; the frontend audit currently reports two moderate React Router advisories, documented in the completion report
- [ ] `npm ci` in CI (not `npm install`)
- [ ] Socket.io connections validated with JWT before any room join
- [ ] HTTPS enforced in production

---

## 15. Background Jobs & Cron

> **Implementation status:** **Partial.** WhatsApp appointment confirmation/reminder jobs are persisted with idempotency keys, leases, bounded retries, dead-letter handling, and delivery state. The illustrative cron sketch below covers broader future workflows and is not the implementation used by the communications worker.

```typescript
// src/services/cron.service.ts

// 1. Appointment reminders — every 15 minutes
// Finds appointments where scheduledAt is in 24h±5min or 2h±5min
cron.schedule('*/15 * * * *', async () => {
  await reminderService.sendDueReminders();
});

// 2. Feedback requests — every 30 minutes
// Finds appointments completed 2+ hours ago with no feedback sent
cron.schedule('*/30 * * * *', async () => {
  await feedbackService.sendDueFeedbackRequests();
});

// 3. Dropout radar — daily at 9:00 AM IST (03:30 UTC)
cron.schedule('30 3 * * *', async () => {
  await dropoutService.scanAndFlag();
});

// 4. No-show marking — daily at 11:59 PM IST (18:29 UTC)
cron.schedule('29 18 * * *', async () => {
  await appointmentService.markNoShows();
  // Marks all pending/confirmed past-scheduledAt appointments as no_show
});

// 5. Plan expiry check — daily at midnight IST (18:30 UTC)
cron.schedule('30 18 * * *', async () => {
  await clinicService.checkPlanExpiry();
  // Flags expired plans, sends renewal reminder email to admin
});
```

---

## 16. Payments — Razorpay

> **Implementation status:** **Not started.** No billing routes, Razorpay SDK, subscription state machine, webhook handler, or feature-gating middleware is implemented.

### Subscription Plans

| Plan | Monthly | Doctors | Patients/Month | AI Features |
|---|---|---|---|---|
| Starter | ₹1,999 | 1 | 100 | No |
| Growth | ₹3,999 | 3 | 500 | Yes (F09, F15) |
| Pro | ₹6,999 | Unlimited | Unlimited | Yes + F20 |

### Plan Feature Gating

```typescript
const PLAN_FEATURES: Record<string, string[]> = {
  starter: ['F01','F02','F03','F04','F05','F06','F07','F08','F10','F11','F12','F13'],
  growth:  ['F01','F02','F03','F04','F05','F06','F07','F08','F09','F10',
              'F11','F12','F13','F15','F16','F18','F19'],
  pro:     ['F01','F02','F03','F04','F05','F06','F07','F08','F09','F10',
              'F11','F12','F13','F15','F16','F18','F19','F20'],
};

export const requirePlan = (minPlan: 'starter' | 'growth' | 'pro') =>
  async (req: Request, res: Response, next: NextFunction) => {
    const clinic = await Clinic.findById(req.user.clinicId);
    if (!isPlanSufficient(clinic.plan, minPlan)) {
      return res.status(403).json({
        success: false,
        error: { code: 'PLAN_UPGRADE_REQUIRED', message: `This feature requires ${minPlan} plan` }
      });
    }
    next();
  };
```

### Subscription Flow

```typescript
// 1. Admin selects plan → POST /api/v1/billing/subscribe
// 2. Backend creates Razorpay subscription
// 3. Frontend renders Razorpay checkout widget
// 4. On success → Razorpay sends webhook to /api/v1/billing/webhook
// 5. Backend verifies HMAC → updates clinic.plan + clinic.planExpiresAt

// Webhook HMAC verification:
const expectedSignature = crypto
  .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');

if (!safeCompare(expectedSignature, req.headers['x-razorpay-signature'] as string)) {
  return res.status(401).json({ success: false });
}
```

---

## 17. Deployment

> **Deployment status:** **Not started.** The services map is a target, not evidence of a deployed system. The repository CI workflow is implemented and verifies the application without deploying it.

### Services Map

| Service | Platform | Config |
|---|---|---|
| Frontend | Vercel | Set `VITE_API_BASE_URL` in dashboard |
| Backend | Render / Railway | Set all backend env vars |
| Database | MongoDB Atlas | IP allowlist → only backend IP |
| ML Service | Render (Python) | Set `ML_SERVICE_URL` in backend |
| Files | Cloudinary | PDFs + QR codes |
| Monitoring | Sentry | Separate DSNs for backend + frontend |

### CI Baseline (GitHub Actions)

`.github/workflows/ci.yml` uses `windows-latest` so committed Win32 visual baselines are compared on the platform where they were generated. It runs:

- Backend: `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run build`, and `npm run audit`.
- Frontend: `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:visual`, and `npm run audit` after installing Playwright Chromium.

Workflow tests launch a dedicated ephemeral MongoDB replica set and deterministic seed server. Ports default to frontend `5190` and backend `5050`, and can be isolated with `RXFLOW_E2E_FRONTEND_PORT` and `RXFLOW_E2E_BACKEND_PORT` when parallel local runners exist. Visual tests mock API contracts; workflow tests use only that isolated seeded database. Existing visual baselines are retained, with receptionist patient-workflow and doctor queue baselines at desktop, tablet, and mobile sizes.

### Frontend Feature and UI Foundation (2026-08-02)

The frontend now routes authentication and administrative settings through feature modules and shares UI primitives for page headings, form fields and errors, responsive data lists/mobile cards, confirmation dialogs, modals, loading skeletons, application states, search, pagination, status badges, and toast notifications. These primitives consume the existing semantic theme tokens; clinic branding changes only brand and accent tokens, leaving clinical status colors protected.

The responsive application shell provides a keyboard-contained navigation drawer with Escape dismissal and focus restoration. Modal and confirmation behavior includes focus containment, an accessible dialog name, a safe initial focus target, and focus restoration. Motion is suppressed when `prefers-reduced-motion` is active, and interactive controls retain a minimum 44px target.

Playwright coverage verifies light, dark, and system modes; clinic token branding; reusable field errors; loading, empty, error, forbidden, offline, reconnect/session-expired states; keyboard behavior; responsive overflow; reduced motion; and automated critical/serious axe checks. Dashboard screenshot baselines cover admin, doctor, and receptionist roles at desktop (1440×900), tablet (820×1180), and mobile (390×844) sizes. The verified local baseline is 31 workflow tests, 36 accessibility cases, and 39 visual comparisons, with no skips.

---

## 18. Business Model

### Pricing

| Plan | Monthly | Yearly (Save 17%) |
|---|---|---|
| Starter | ₹1,999 | ₹19,999 |
| Growth | ₹3,999 | ₹39,999 |
| Pro | ₹6,999 | ₹69,999 |

### Revenue Model

- **B2B SaaS** — sell directly to clinics
- **Flat monthly subscription** — no per-patient fee
- **WhatsApp API costs** — absorbed or passed through based on plan
- **AI API costs** — clinic brings their own key (zero cost to RxFlow AI)
- **ML** — runs locally, zero variable cost

---

## Appendix A — Postman Run Order

```text
1.  POST   /api/v1/auth/clinic-signup
2.  POST   /api/v1/auth/staff                     # create doctor/receptionist
3.  POST   /api/v1/auth/login                     # staff temporary password
4.  POST   /api/v1/auth/password/complete-first-sign-in
5.  POST   /api/v1/auth/login                     # staff permanent password
6.  GET    /api/v1/clinic/me
7.  POST   /api/v1/patients                       # creates first queue entry + opaque QR
8.  GET    /api/v1/patients?search=<full-name>    # exact returning-patient lookup
9.  POST   /api/v1/patients/:patientId/check-ins  # subsequent clinic day
10. GET    /api/v1/patients/queue
11. PATCH  /api/v1/patients/queue/:queueEntryId/status  # in_consultation
12. POST   /api/v1/prescriptions                  # doctor + clinicianConfirmed
13. GET    /api/v1/prescriptions?patientId=:patientId
14. GET    /api/v1/patients/:patientId/qr
15. GET    /api/v1/patients/qr/:qrToken
16. POST   /api/v1/auth/refresh
17. POST   /api/v1/auth/logout
18. GET    /api/v1/auth/me                        # verify 401 after logout
19. POST   /api/v1/auth/password/forgot           # generic 202; local capture only outside production
20. POST   /api/v1/auth/password/reset            # single-use token; revokes all user sessions
```

Template, public PDF storage, ML, and billing calls are intentionally excluded because those endpoints are not implemented. Appointment, communication, AI-assistance, analytics, dropout, and feedback routes are documented in the implementation updates below and in `md/API_Documentation.md`.

---

## Appendix B — .gitignore

```gitignore
node_modules/
.env
.env.*
!.env.example
*.pem
*.key
*.pkl
dist/
build/
out/
*.tsbuildinfo
*.log
coverage/
.DS_Store
Thumbs.db
```

---

## Appendix C — .cursorignore

```gitignore
.env
.env.*
!.env.example
node_modules/
dist/
build/
*.pem
*.key
*.pkl
coverage/
```

---

*RxFlow AI — PDR v1.1 (implementation-aligned)*
*Stack: MERN + TypeScript | Blueprint: v2.2*
## 19. Admin Clinic Settings and Staff Management Completion

The admin workflow now covers clinic profile/contact details, address, ordered working hours, capacity, validated clinic-owned logo upload, accessible primary/accent colours with live preview, backend-enforced password policy, secret-free AI configuration status, searchable/filterable/paginated staff management, doctor/receptionist creation, enable/disable/password reset, and paginated administrative audit history.

All reads and mutations derive `clinicId` from the verified access token. Staff target mutations also match the target against that clinic, and every admin route enforces the admin role server-side. Logo bytes are capped at 2 MB and validated by MIME plus signature. AI keys remain encrypted and are never returned. Administrative history is limited to settings and staff lifecycle actions and excludes passwords, API keys, patient details, prescription contents, PII-bearing AI prompts, IP hashes, and secrets.

Contract changes are documented in `md/API_Documentation.md` Section 20. The staff list is paginated under `data.staff`; duplicate staff email returns `409 CONFLICT`; clinic logo read/write and administrative audit endpoints are available under `/api/v1/clinic/me`.

*Features: 18 | AI-powered: 1 currently active (F09 assistance); F15 is deterministic in this release | Roles: 3*

## 20. Operational Analytics, Rule-Based Dropout Radar, and Feedback (2026-08-02)

This section supersedes the earlier F15, F18, and F19 “not started” descriptions.

### Operational analytics

`GET /api/v1/analytics/operations` is available only to authenticated admins and doctors. Every query derives `clinicId` from the verified access token. Doctors are always restricted to their own records; an attempted foreign doctor filter resolves as not found. The required `from` and `to` dates are inclusive clinic-local dates in `Asia/Kolkata`, with a maximum range of 366 days. An optional `doctorId` filter is available to admins.

The response is calculated from persisted clinic records and contains:

- daily visit volume from `VisitQueue.queueDate`, including zero-value days;
- waiting-time buckets (`<15`, `15–29`, `30–59`, `60+` minutes) from valid check-in and consultation-start timestamps;
- queue completion and cancellation counts/rates;
- per-doctor visit totals, completions, cancellations, and average wait;
- returning-visit rate, where a visit is returning only when that patient has an earlier clinic queue visit;
- appointment no-show rate using `no_show / (completed + no_show)`;
- message delivery and reply rates only from persisted communication or legacy tracked-delivery records; absent tracking returns `available: false` and a `null` rate;
- consented feedback response count and average rating.

`GET /api/v1/analytics/operations.csv` applies the same authorization and filters. It returns `Cache-Control: private, no-store` and aggregate rows only. Patient identifiers, names, phone numbers, prescription content, feedback comments, AI content, tokens, and provider identifiers are excluded.

### Transparent dropout radar

`GET /api/v1/analytics/dropouts?asOf=YYYY-MM-DD&doctorId=...` is an admin/doctor endpoint. It flags an active patient only when a recorded `followupDueDate` is at least 7 days overdue. Thresholds are 7, 14, 30, and 60 days. Each item returns the due date, as-of date, exact overdue-day count, selected threshold, and a plain-language `rule` string. It does not use diagnosis, medication, an AI prompt, a statistical model, or a medical-risk score.

Admins may update any clinic-owned patient and doctors may update only patients assigned to them through `PATCH /api/v1/patients/:patientId/follow-up`. Receptionists are forbidden. Clearing or changing the date is audited without placing patient details in audit metadata. No outreach is sent automatically.

### Consented patient feedback

Admins and doctors may issue a one-time feedback link for a completed clinic-owned appointment through `POST /api/v1/feedback/requests`. Doctors may issue links only for their own appointments. The response explicitly reports `delivery.status: not_sent`; it never claims that the link was messaged. The raw token is returned once in the share URL, while only its SHA-256 hash is stored.

`POST /api/v1/feedback/submit/:token` is public and rate limited. It requires literal consent, an integer rating from 1 to 5, and accepts an optional trimmed comment up to 1,000 characters. Control characters and excessive links are rejected. Tokens expire, are single-use, and reveal no patient or appointment data in the response.

`GET /api/v1/feedback` is clinic-private to admins and doctors, date-filtered, doctor-filtered, and paginated. Receptionists are forbidden. Comments are rendered as text and never included in analytics CSV export.

The responsive frontend exposes analytics, dropout, and feedback pages only to doctor/admin roles as a usability guard; backend role and tenant checks remain authoritative. Charts include accessible text-table equivalents and mobile visual coverage.
