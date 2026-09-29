# RxFlow AI Repair Report

## Source audit

The uploaded `may10(1).zip` contained the working RxFlow clinic backend and frontend, but the root `jarvis-agent/` directory was empty and no Jarvis routes or visual components were active. The repair was therefore applied against the uploaded codebase rather than against earlier generated packages.

## Confirmed defects fixed

### Backend build output was incompatible with the start command

The backend TypeScript configuration compiled `src/server.ts` to `dist/src/server.js`, while `npm start` expected `dist/server.js`.

**Fix:** production compilation now uses `rootDir: "src"` and includes only application source. A separate `tsconfig.test.json` preserves test typechecking. A clean build now creates `dist/server.js` and `dist/app.js`.

### Jarvis was absent

The uploaded project had no functional Jarvis service or frontend integration.

**Fix:** added a separate database-independent `jarvis-agent/`, main-backend session/action/tool modules, doctor-only frontend integration, compact dock, full workspace, and deterministic particle core.

### Jarvis browser origin could be rejected

The agent now uses an explicit `JARVIS_ALLOWED_ORIGINS` allowlist and correctly responds to the Vite frontend origin.

### Internal service authentication needed one canonical format

Both services now sign and verify:

```text
METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_BODY
```

Requests reject stale timestamps, invalid signatures, altered request bodies, and replayed nonces.

### Patient confirmation needed authoritative session binding

Patient lookup creates a persisted pending action. Doctor confirmation revalidates the patient and queue entry in the main backend, updates the authoritative Jarvis session, increments its token version, and returns a refreshed short-lived token.

### AI prescription drafts could outlive the consultation context

Prescription drafts now require a confirmed patient and active `in_consultation` queue entry. Confirmation fails closed when patient, queue entry, doctor, clinic, payload hash, expiry, or consultation status changes.

### Empty AI values could damage manual work

The frontend applies only non-empty AI fields and resets clinician confirmation. The existing prescription endpoint remains the only final clinical write.

### Patient display-code lookup had an arbitrary scale limit

The earlier lookup approach was constrained by a 1,000-record scan. The repair uses a clinic/doctor-scoped MongoDB aggregation to derive the `RXF-xxxxxx` suffix without the fixed cap. This is functionally correct, though a persisted indexed patient code is recommended for larger installations.

### WhatsApp template parameters could race the worker

The communication record now stores template parameter values at creation time, before a worker can claim the job. This prevents a fast worker from sending an approved template with missing parameters.

### Crashed WhatsApp jobs could remain stuck

Workers can reclaim `processing` jobs after their lease expires.

### Reminders could be sent after appointment state changed

Immediately before provider transmission, the worker rechecks referenced appointments and prescriptions. Cancelled, completed, or no-show appointments are not sent reminders. Cancelling reference jobs now includes currently leased processing jobs.

### Medicine inventory was missing

Added clinic-scoped medicine inventory models, validation, CRUD/search/low-stock endpoints, permissions, frontend inventory management, and read-only Jarvis inventory tools.

### Jarvis visualization layout was structurally wrong

The new compact dock is fixed to the viewport, bounded, and does not split the dashboard horizontally. The full workspace fills the app content region. Only one React Three Fiber canvas is declared; the closed launcher uses CSS rather than a second WebGL renderer.

### Particle positions were unstable or overexposed

Particles use deterministic seeded base positions distributed across inner core, main sphere, and outer halo layers. State/audio movement is bounded around those positions. The center does not use a large bloom pass or white full-screen flare.

### Frontend needed a consistent visual refresh

Added a layered workspace stylesheet that modernizes navigation, headers, cards, forms, focus states, responsiveness, and inventory surfaces while retaining the existing route structure and theme tokens.

## Architecture preserved

- The main backend remains the only service with MongoDB access.
- Jarvis calls only allowlisted backend tools.
- Provider and ElevenLabs keys stay server-side.
- Doctors must confirm patient binding and review prescription drafts.
- WhatsApp delivery is reported only from recorded provider status.
- Jarvis failures leave the manual clinic workflow available.
