# RxFlow MyAI Jarvis — A-to-Z Backend, Workflow, Layout, and Stable Visual Repair Prompt

## Purpose

You are repairing the existing RxFlow MyAI Jarvis implementation.

This is not a greenfield redesign. The repository already contains:

- an RxFlow backend;
- a React/Vite frontend;
- a separate `jarvis-agent/` Node.js/TypeScript service;
- OpenAI and Gemini provider adapters;
- patient, queue, inventory, prescription, communication, and approval concepts;
- a Jarvis dock and particle visualization.

The current application is not acceptable because:

- the Jarvis dock occupies a large horizontal section of the dashboard;
- only part of the Jarvis visualization is visible;
- the dashboard and Jarvis each occupy an unintended portion of the screen;
- the particle center is overexposed and almost completely white;
- particles appear random and do not preserve a stable intelligence-core shape;
- the visual layout is mounted against the wrong container;
- the close/expand controls are poorly positioned;
- the input bar is detached from the intended assistant panel;
- agent connectivity and patient-binding workflows are incomplete or unreliable.

Your goal is to make the complete Jarvis workflow correct from A to Z:

1. backend and agent connectivity;
2. authenticated doctor Jarvis sessions;
3. safe tool execution;
4. patient lookup and confirmation;
5. queue and inventory questions;
6. prescription draft and doctor review;
7. truthful communication status;
8. reliable voice/text interaction;
9. a correct compact dock;
10. a correct full-screen Jarvis page;
11. stable, smooth, audio-reactive particles;
12. complete endpoint and browser acceptance tests.

Do not claim completion based only on code inspection. Execute and verify the real workflows.

---

# 1. Important findings from the uploaded `jarvis-agent` ZIP

Treat these as confirmed audit findings that must be verified and resolved in the complete repository.

## 1.1 The uploaded ZIP contains a real `.env` file

The uploaded `jarvis-agent/` directory contains `.env` with non-empty:

- Jarvis JWT secret;
- internal HMAC secret;
- Gemini API key;
- service configuration.

Do not print the values.

Before continuing:

1. Treat every credential in the uploaded `.env` as exposed.
2. Rotate the Gemini API key.
3. Rotate `JARVIS_SESSION_JWT_SECRET`.
4. Rotate `JARVIS_INTERNAL_HMAC_SECRET`.
5. Remove `.env` from archives and source control.
6. Verify `.gitignore` excludes `.env`.
7. Keep only a safe `.env.example`.
8. Search Git history and build artifacts for leaked secrets.
9. Do not proceed with production deployment until rotation is complete.

This is a release blocker.

## 1.2 The ZIP does not include the main frontend or RxFlow backend

The visual defect shown in the screenshot cannot be fully corrected from `jarvis-agent/` alone.

The coding task must be executed from the complete project root containing:

```text
backend/
frontend/
jarvis-agent/
```

Do not pretend the dock layout was fixed if only `jarvis-agent/` was edited.

## 1.3 The current CORS configuration is likely incorrect for the browser

Current `jarvis-agent/src/app.ts` allows origins based on:

```text
JARVIS_PUBLIC_URL
RXFLOW_BACKEND_URL
```

The visible frontend runs at an origin such as:

```text
http://localhost:5173
```

A service’s own public URL is not automatically the frontend origin.

Replace this design with an explicit allowlist such as:

```env
JARVIS_ALLOWED_ORIGINS=http://localhost:5173
```

Support comma-separated origins.

Reject wildcard origins when credentials are enabled.

Add an integration test proving that the real frontend origin receives the correct CORS headers.

## 1.4 Tool registrations are duplicated

The uploaded code registers tools in:

```text
src/tools/tool-registry.ts
```

and again through:

```text
src/tools/definitions/register-tools.ts
```

The second registration overwrites several Zod-validated tools with versions using `any`.

This creates inconsistent validation and makes behavior dependent on import order.

Fix by:

1. keeping one canonical implementation per tool;
2. keeping one registration location;
3. requiring strict input and output Zod schemas;
4. rejecting unknown fields;
5. failing startup on duplicate tool names.

## 1.5 Approval policy exists but is not enforced by the orchestrator

`approval-policy.ts` classifies actions, but the current orchestrator does not use it before executing tools.

Integrate the approval policy into the real tool loop.

Rules:

- read-only tools may execute;
- protected actions create a pending action;
- forbidden actions are rejected;
- unknown actions default to forbidden;
- the model cannot bypass policy through arguments or text.

## 1.6 Proposed actions are not connected to the action store

The orchestrator currently creates a UI-style `proposedActions` object for patient lookup, but it does not create a real `ActionStore` entry or return a usable `actionId`.

The confirmation endpoint expects an `actionId`.

This means patient confirmation cannot complete reliably.

Fix the full contract:

```text
tool result
→ create pending action
→ return actionId
→ doctor confirms
→ backend revalidates patient/queue
→ backend changes session binding
→ browser receives refreshed Jarvis session token
```

Do not merely mark an in-memory object as confirmed.

## 1.7 Confirming an action does not bind the session

The current `/v1/actions/:actionId/confirm` endpoint changes action status and returns its payload, but:

- the short-lived JWT remains unchanged;
- no patient binding is written to an authoritative session store;
- no updated token is issued;
- future turns still use the old `boundPatientId`.

Move authoritative session binding to the main RxFlow backend.

Recommended contract:

```http
POST /api/v1/jarvis/sessions/:sessionId/actions/:actionId/confirm
```

The backend must:

1. authenticate the doctor;
2. verify session ownership;
3. verify clinic ownership;
4. verify action expiry and payload hash;
5. revalidate the patient and queue entry;
6. update session binding;
7. issue a refreshed short-lived Jarvis token;
8. audit the action without clinical text.

The agent may hold ephemeral action context, but the main backend must own the final binding.

## 1.8 Conversation state is not preserved across turns

The current orchestrator begins each turn with only the new user message.

Implement bounded session conversation state or send a bounded, sanitized conversation window from an authoritative session layer.

Requirements:

- do not depend on hidden provider conversation storage;
- limit turns and total characters/tokens;
- never store secrets;
- expire state with the Jarvis session;
- invalidate patient-specific context when patient binding changes;
- keep clinical context minimal.

## 1.9 `clientTurnId` is not used for idempotency

Add an idempotency store keyed by:

```text
sessionId + clientTurnId
```

A repeated browser request must return the previous result or a safe in-progress response without executing tools twice.

## 1.10 HMAC canonicalization must match on both services

The uploaded client signs:

```text
timestamp.nonce.bodyDigest
```

Earlier architecture requires:

```text
HTTP method
request path
timestamp
nonce
body digest
```

Inspect the main backend implementation and select one canonical format.

Use the stronger format:

```text
METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256_BODY
```

Apply exactly the same canonicalization on both sides.

Add tests for:

- valid signature;
- changed method;
- changed path;
- changed body;
- stale timestamp;
- duplicate nonce;
- malformed headers;
- timing-safe comparison.

## 1.11 Provider readiness and browser connection are mixed together

`GET /ready` returns 503 when the selected AI provider has no key.

The UI must distinguish:

- agent service unreachable;
- agent service running but provider not configured;
- backend session endpoint unavailable;
- invalid Jarvis token;
- provider temporarily unavailable.

Do not show every condition as:

```text
Unable to connect to Jarvis session
```

Use structured error codes and specific recovery actions.

## 1.12 Offline mode echoes the doctor’s full message

When no provider is ready, the current response includes the full user message.

Do not echo potentially clinical content in a sandbox status response.

Return a neutral response:

```json
{
  "code": "PROVIDER_NOT_CONFIGURED",
  "message": "Jarvis AI provider is not configured. Continue manually or configure a provider."
}
```

## 1.13 The OpenAI adapter does not match the architecture document

The architecture says to use the Responses API, while the current implementation uses Chat Completions.

Choose one documented, tested implementation and update documentation truthfully.

Do not state that Responses API is implemented unless it actually is.

## 1.14 Gemini request cancellation and timeout are incomplete

The Gemini provider does not currently use the passed abort signal and does not implement a clear timeout.

Add provider-independent timeout and cancellation around every request.

## 1.15 Tool and provider errors are collapsed into misleading error codes

Backend tool failures currently may become `PROVIDER_ERROR`.

Introduce clear categories:

```text
AGENT_UNAVAILABLE
PROVIDER_NOT_CONFIGURED
PROVIDER_TIMEOUT
PROVIDER_RATE_LIMITED
BACKEND_TOOL_UNAVAILABLE
BACKEND_TOOL_REJECTED
SESSION_EXPIRED
ACTION_EXPIRED
VALIDATION_ERROR
```

The frontend must map each category to a truthful user message.

---

# 2. Execution rules

- Work from the complete project root.
- Read repository instructions before changing code.
- Do not delete or rewrite working clinic modules unnecessarily.
- Keep the RxFlow backend as the only authority for MongoDB and clinical writes.
- Keep provider API keys server-side.
- Do not expose secrets through Vite variables.
- Do not let Jarvis finalize prescriptions autonomously.
- Do not let Jarvis directly send WhatsApp messages.
- Do not let the model provide `clinicId` or `doctorId`.
- Never invent patient, queue, inventory, appointment, or communication data.
- Preserve the complete manual workflow when Jarvis fails.
- Use actual tests and report actual results.
- Do not hide failing tests by removing them.
- Do not update visual snapshots before inspecting the differences.

---

# 3. Phase A — Establish a clean baseline

## A1. Create a backup branch

Create a branch such as:

```text
fix/jarvis-a-to-z
```

Record the current commit.

## A2. Remove exposed credentials

Complete the rotation and `.env` cleanup described above.

Add a secret-scanning command or CI check.

## A3. Inventory the real project

Create:

```text
artifacts/jarvis-repair/baseline-audit.md
```

Document:

- project tree;
- backend routes;
- Jarvis routes;
- frontend Jarvis components;
- provider selection;
- session flow;
- tool list;
- action confirmation flow;
- voice implementation;
- visualization libraries;
- all mounted WebGL canvases;
- all Jarvis CSS containers.

## A4. Run baseline commands

Run without changing code:

```text
backend:
  npm run typecheck
  npm run build
  npm run test:unit
  npm run test:integration

jarvis-agent:
  npm run typecheck
  npm run build
  npm run test:unit
  npm run test:integration

frontend:
  npm run typecheck
  npm run build
  npm run test:unit
  npm run test:e2e
  npm run test:a11y
  npm run test:visual
```

Record actual failures.

If dependencies from an archive cannot execute because platform-specific optional packages are missing, remove archived `node_modules` and perform a clean install using the repository lockfile.

Do not remove the lockfile unless there is a documented lockfile corruption.

---

# 4. Phase B — Repair backend and agent connectivity

## B1. Correct environment contracts

### `jarvis-agent/.env.example`

Use:

```env
NODE_ENV=development
PORT=5001
JARVIS_PUBLIC_URL=http://localhost:5001
JARVIS_ALLOWED_ORIGINS=http://localhost:5173
RXFLOW_BACKEND_URL=http://localhost:5000

JARVIS_SESSION_JWT_SECRET=<64-plus-random-characters>
JARVIS_INTERNAL_HMAC_SECRET=<different-64-plus-random-characters>

AI_PROVIDER=gemini
OPENAI_API_KEY=
OPENAI_MODEL=
GEMINI_API_KEY=
GEMINI_MODEL=

AGENT_MAX_TOOL_STEPS=4
AGENT_REQUEST_TIMEOUT_MS=15000
AGENT_MAX_INPUT_CHARS=4000
AGENT_MAX_CONVERSATION_TURNS=12
AGENT_MAX_CONVERSATION_CHARS=24000
LOG_LEVEL=info
STORE_PROVIDER_CONTENT=false
```

Validate every field.

Do not use placeholder provider keys that resemble real keys.

### Main backend

Verify matching values for:

```env
JARVIS_ENABLED=true
JARVIS_AGENT_URL=http://localhost:5001
JARVIS_SESSION_JWT_SECRET=<same-session-secret>
JARVIS_INTERNAL_HMAC_SECRET=<same-hmac-secret>
JARVIS_SESSION_TTL_SECONDS=300
JARVIS_INTERNAL_MAX_SKEW_SECONDS=60
```

## B2. Fix CORS

Implement a parsed origin allowlist.

Test preflight and POST requests from the real frontend origin.

## B3. Verify service startup order

Recommended local startup order:

1. MongoDB;
2. main backend on 5000;
3. Jarvis agent on 5001;
4. frontend on 5173.

The frontend must call the main backend to create a session before calling the agent.

## B4. Implement a diagnostic endpoint

Add an authenticated doctor-only main-backend endpoint:

```http
GET /api/v1/jarvis/diagnostics
```

Return only safe status:

```json
{
  "enabled": true,
  "backendSessionRoute": "ready",
  "agentReachable": true,
  "agentReady": true,
  "provider": "gemini",
  "providerConfigured": true,
  "internalToolContract": "ready"
}
```

Do not return keys, URLs containing tokens, secrets, patient data, or internal stack traces.

## B5. Use structured health states

Agent:

```http
GET /health
GET /ready
```

Backend should check the agent with a bounded timeout.

Frontend must display distinct messages for:

- Jarvis disabled;
- provider not configured;
- session expired;
- agent unavailable;
- backend unavailable;
- microphone unavailable;
- voice output unavailable.

---

# 5. Phase C — Repair authentication, sessions, and actions

## C1. Main backend creates sessions

Use an endpoint similar to:

```http
POST /api/v1/jarvis/sessions
```

Guards:

- authenticated;
- password-ready;
- role doctor;
- active account;
- feature enabled.

Optional request:

```json
{
  "patientId": "...",
  "queueEntryId": "..."
}
```

If supplied, verify:

- same clinic;
- same doctor;
- patient belongs to queue entry;
- queue status is `in_consultation`.

Response:

```json
{
  "success": true,
  "data": {
    "sessionId": "...",
    "token": "...",
    "expiresAt": "...",
    "agentUrl": "http://localhost:5001",
    "boundPatientId": null,
    "boundQueueEntryId": null
  }
}
```

Store the browser token in memory only.

## C2. Agent verifies exact claims

Verify:

- issuer;
- audience;
- expiry;
- `sub === doctorId`;
- role doctor;
- session ID;
- clinic ID;
- session version or revocation marker if implemented.

## C3. Create real pending actions

Pending action contract:

```ts
type PendingAction = {
  actionId: string;
  type: "confirm_patient_binding" | "review_prescription_draft";
  sessionId: string;
  clinicId: string;
  doctorId: string;
  patientId?: string;
  queueEntryId?: string;
  payload: unknown;
  payloadHash: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
};
```

Return `actionId` to the frontend.

## C4. Confirmation must perform a real workflow

For patient binding:

1. doctor clicks confirmation;
2. frontend sends action ID to main backend;
3. backend revalidates patient and queue;
4. backend updates authoritative session state;
5. backend issues refreshed Jarvis JWT;
6. frontend replaces the in-memory token;
7. old patient-specific pending actions are invalidated.

For prescription draft review:

1. doctor clicks “Apply for review”;
2. backend/agent verifies action hash and binding;
3. frontend merges only non-empty fields;
4. clinician confirmation resets;
5. final prescription endpoint remains separate.

## C5. Add cancellation

Add action cancellation.

Cancel actions when:

- doctor switches patient;
- doctor switches queue entry;
- session expires;
- assistant closes;
- doctor logs out;
- action expires.

## C6. Idempotency

Store completed turn responses for the session lifetime.

Do not execute a repeated `clientTurnId` twice.

---

# 6. Phase D — Repair tool architecture

## D1. One registry, one implementation

Remove duplicate tool files or make one side re-export the canonical implementation.

Startup must throw on duplicate names.

## D2. Strict schemas

Each tool must have:

- strict Zod input schema;
- strict Zod output schema;
- tool risk classification;
- timeout;
- audit behavior;
- safe error mapping.

## D3. Enforce approval policy

Read-only:

```text
lookup_patient
get_patient_context
get_queue_status
search_inventory
get_low_stock
get_recent_prescriptions
get_communication_status
```

Protected:

```text
confirm_patient_binding
review_prescription_draft
apply_ui_draft
```

Forbidden:

```text
finalize_prescription
send_direct_patient_message
mark_message_delivered
change_inventory
delete_patient
execute_raw_query
```

## D4. Do not trust model identity fields

The tool executor must ignore or reject:

```text
clinicId
doctorId
role
sessionId
```

from model arguments.

Use signed session context only.

## D5. Implement actual backend tool contract tests

Verify exact request and response schemas between:

```text
jarvis-agent
→ /api/v1/internal/jarvis/tools/execute
→ main backend
```

---

# 7. Phase E — Provider reliability

## E1. Provider-neutral interface

Keep one normalized interface.

Validate every provider response.

## E2. Add timeout and cancellation

Use one parent abort controller per turn.

Abort on:

- configured timeout;
- browser disconnect;
- session cancellation.

Use `req.on("aborted")`.

For response closure, only abort when the response did not finish successfully.

Do not abort a valid request because the incoming request stream emitted a normal close event.

## E3. Safe errors

Do not return raw provider errors to the browser.

Do not log full provider request or response content.

## E4. Provider readiness

Development may run without a provider, but:

- `/ready` must identify `provider_not_configured`;
- messages must return a structured 503 or controlled fallback;
- do not echo the doctor’s full message.

## E5. Bounded conversation state

Maintain only enough context for the active session.

Invalidate clinical context when the patient changes.

---

# 8. Phase F — Correct the frontend layout first

The screenshot confirms a severe layout bug:

- `Jarvis Dock` is rendered as a full-width section at the bottom of the dashboard;
- the particle canvas is a wide horizontal banner;
- the orb is zoomed beyond the container and clipped;
- the center is pure white;
- the input is attached to the viewport bottom rather than a compact panel;
- dashboard content occupies the upper portion while Jarvis occupies the lower portion;
- the user does not receive either a proper compact dock or a proper full-screen assistant.

Do not tune particles before fixing the component mount and CSS containment.

## F1. Required access modes

### Compact mode

Closed:

- one 52–60 px launcher;
- fixed bottom-right;
- safe distance from viewport edges;
- no canvas larger than the launcher.

Open:

- fixed right-side panel;
- width 380–440 px;
- height 560–720 px, capped by viewport;
- not full width;
- not a bottom horizontal strip on desktop;
- one header;
- one visualization area;
- one transcript/result area;
- one input/control area;
- launcher hidden while open.

Suggested desktop structure:

```text
JarvisDock
├── JarvisDockHeader
├── JarvisVisualViewport
├── JarvisStatusAndTranscript
├── JarvisResultCards
└── JarvisComposer
```

Suggested CSS:

```css
.jarvis-dock {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: min(420px, calc(100vw - 32px));
  height: min(680px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: auto minmax(220px, 42%) minmax(0, 1fr) auto;
  overflow: hidden;
  border-radius: 24px;
  z-index: 1200;
  background: rgba(3, 8, 15, 0.96);
  contain: layout paint;
}

.jarvis-dock-visual {
  position: relative;
  min-height: 220px;
  overflow: hidden;
  isolation: isolate;
}

.jarvis-dock-visual canvas {
  position: absolute !important;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  display: block;
}
```

Do not blindly paste CSS; adapt it to the project’s tokens.

### Full-screen mode

Add or correct:

```text
/app/jarvis
```

The full-screen page may keep the application sidebar, but the Jarvis content region must fill the remaining application viewport.

Structure:

```text
AppShell
├── ExistingSidebar
└── JarvisWorkspace
    ├── VisualizationLayer
    └── InterfaceLayer
```

Use:

```css
.jarvis-workspace {
  position: relative;
  min-width: 0;
  min-height: calc(100dvh - var(--topbar-height));
  overflow: hidden;
  background: #02050a;
  isolation: isolate;
}
```

Do not mount the full-screen visualization inside a dashboard card or a fixed-height banner.

## F2. Mobile

On mobile, compact mode becomes a bottom sheet.

This is the only mode where a bottom-oriented panel is acceptable.

It must not appear as a partially visible horizontal strip.

## F3. One visual renderer

Only one WebGL canvas may be active:

- launcher uses a lightweight CSS/SVG preview or tiny canvas;
- open dock mounts the compact renderer;
- full-screen route unmounts the dock renderer;
- closing unmounts or pauses the renderer.

Add a development assertion counting Jarvis canvases.

Expected:

```text
0 while off
1 while dock open
1 while full-screen open
never 2
```

## F4. Fix controls

- Header contains title, status, expand, and close.
- Close button stays inside the header.
- Input stays inside the dock.
- No labels float outside the panel.
- Remove production debug labels.
- No duplicated “Jarvis Intelligence” strip.

---

# 9. Phase G — Build a stable particle core

The visual must not be a random particle screensaver.

## G1. Permanent base formation

Every particle receives a deterministic base position once.

Use seeded generation.

No `Math.random()` inside:

- React render;
- `useFrame`;
- requestAnimationFrame;
- microphone callbacks;
- shader uniform updates.

Final position:

```text
base sphere position
+ bounded procedural flow
+ bounded state displacement
+ bounded audio displacement
```

Particles must always return toward their base formation.

## G2. Correct distribution

Use:

```text
15% dense inner core
75% main sphere shell/volume
10% sparse outer halo
```

Maximum radius must be bounded.

No particles may escape across the dashboard.

## G3. Correct framing

Compact core:

```text
approximately 130–180 px visible diameter
```

Full-screen core:

```text
approximately 38–52% of content viewport height
```

Camera must not be inside the sphere.

Resize against the direct visual container, not `window`.

Use `ResizeObserver`.

## G4. Calm idle

Idle is slow and stable:

- low turbulence;
- low flow speed;
- subtle breathing;
- no sudden direction changes;
- no large color shifts;
- no overexposure.

The core must remain stable for at least 30 seconds.

## G5. Listening

Real microphone amplitude drives:

- small radius change;
- small flow-speed increase;
- restrained shimmer;
- subtle glow.

Add noise-floor detection.

Silence must remain nearly idle.

Apply attack/release smoothing.

## G6. Thinking

Organized inward spiral or compression.

No random explosion.

## G7. Speaking

Use actual playback amplitude.

Particles move outward in controlled waves.

Transition back to idle smoothly.

## G8. Bloom and exposure

The screenshot shows severe white clipping.

Fix:

- lower bloom intensity;
- raise luminance threshold;
- reduce core radius;
- avoid pure-white central material;
- use tone mapping;
- cap audio brightness;
- keep particle details visible.

The center must never become a full-width white rectangle or giant white oval.

## G9. Background

Use a dark background with a localized radial glow.

Do not change the entire dashboard background based on each audio sample.

State color transitions should be smooth and bounded.

---

# 10. Phase H — Voice integration

Use push-to-talk first.

Flow:

```text
doctor presses mic
→ permission request
→ listening state
→ amplitude visualization
→ stop/cancel
→ transcription
→ editable transcript
→ Jarvis request
→ response text
→ optional server-side TTS
→ speaking visualization
```

Requirements:

- release media tracks;
- stop analyser loops;
- close/suspend AudioContext;
- cap duration and size;
- text fallback;
- no API key in browser;
- no actor or fictional-character voice imitation;
- no full patient phone number spoken;
- do not send unnecessary clinical content to TTS.

Jarvis connectivity must work in text mode even if voice is unavailable.

---

# 11. Phase I — Complete supported workflows

## I1. Patient lookup

Commands:

```text
Open patient RXF-1042.
Find Priya Mehta.
Who is queue number five?
```

Flow:

1. actual backend lookup;
2. exact/multiple/no match;
3. masked duplicate results;
4. doctor confirmation;
5. refreshed session binding;
6. context shown only after confirmation.

## I2. Queue

Commands:

```text
How many patients are remaining?
Who is next?
Show my current patient.
```

All numbers come from backend data.

## I3. Inventory

Commands:

```text
Search paracetamol 500 mg.
Show low-stock medicines.
```

Jarvis may read inventory but not change it.

## I4. Prescription draft

Command:

```text
Add paracetamol 500 mg twice daily for five days after food.
```

Jarvis returns a draft only.

Validation:

- diagnosis optional according to actual schema;
- medicine name;
- dosage;
- frequency;
- duration;
- instructions;
- duplicate warnings;
- inventory status.

Doctor applies for review.

Empty AI fields do not erase manual fields.

Clinician confirmation resets.

Finalization remains the existing backend route.

## I5. Communication status

Report only actual states:

```text
queued
sent
delivered
read
failed
```

Jarvis cannot mark a message delivered.

---

# 12. Phase J — Endpoint workflow acceptance testing

Create real HTTP workflow tests.

Do not call controllers directly.

Start:

- isolated MongoDB;
- main backend;
- Jarvis agent;
- deterministic AI provider mock;
- deterministic communication provider mock.

Test:

1. health and readiness;
2. doctor login;
3. Jarvis session creation;
4. exact patient lookup;
5. duplicate patient lookup;
6. patient confirmation and token refresh;
7. queue count;
8. inventory search;
9. prescription draft;
10. safe merge;
11. explicit finalization;
12. communication queueing;
13. signed delivery webhook;
14. truthful status;
15. session expiry;
16. agent unavailable;
17. provider timeout;
18. CORS from real frontend origin;
19. HMAC replay;
20. cross-clinic denial;
21. repeated client turn idempotency;
22. stale action denial.

Release blockers:

- authorization failure;
- tenant isolation failure;
- autonomous finalization;
- secret exposure;
- unconfirmed patient binding;
- duplicate prescription;
- false communication status.

---

# 13. Phase K — Browser and visual acceptance testing

Use Playwright.

## K1. Layout tests

At desktop:

- dashboard remains full height;
- compact Jarvis is fixed at bottom-right;
- dock width is within bounds;
- dock height is within bounds;
- no horizontal page split;
- no canvas overflow;
- no detached input bar;
- no duplicate launcher;
- no duplicate canvas.

At full-screen:

- Jarvis fills the main content area;
- sidebar is preserved if intended;
- core is centered;
- controls are usable.

At mobile:

- bottom sheet is fully visible;
- no horizontal scrolling;
- primary app navigation remains usable.

## K2. Visual states

Capture:

- idle;
- listening silence;
- listening speech;
- thinking;
- tool running;
- confirmation;
- speaking;
- success;
- warning;
- error;
- disconnected.

## K3. Stability tests

Record idle for 30 seconds.

Fail when:

- core drifts;
- shape collapses;
- particles escape;
- center clips white;
- frame rate falls continuously;
- a second canvas appears;
- memory grows without bound.

## K4. Audio-reactive tests

Use deterministic audio fixtures.

Verify visual differences through uniform/state assertions and recordings.

---

# 14. Required output artifacts

Create:

```text
artifacts/jarvis-repair/
├── baseline-audit.md
├── route-contract-map.md
├── security-findings.md
├── backend-workflow-report.md
├── endpoint-results.json
├── layout-root-cause.md
├── particle-root-cause.md
├── visual-performance.md
├── screenshots/
├── recordings/
└── final-release-report.md
```

Do not include secrets or raw patient data.

---

# 15. Definition of done

The work is complete only when:

## Backend

- exposed credentials rotated;
- frontend CORS origin works;
- main backend creates valid Jarvis sessions;
- HMAC contract matches;
- internal tools work;
- duplicate tool registration removed;
- schemas validate all tool inputs and outputs;
- approval policy is enforced;
- patient confirmation creates a real binding;
- refreshed token is issued;
- idempotency works;
- timeouts and errors are truthful;
- all required endpoint workflows pass.

## Layout

- dashboard is no longer split horizontally;
- dock is a compact fixed panel;
- full-screen route is correct;
- input and controls stay inside the panel;
- one renderer is active;
- no canvas is clipped or stretched;
- mobile layout works.

## Visual

- stable spherical particle formation;
- slow smooth idle;
- microphone-reactive listening;
- organized thinking;
- playback-reactive speaking;
- bounded particles;
- no giant white flare;
- no random particle escape;
- stable for 30 seconds;
- acceptable measured performance.

## Workflow

- patient lookup;
- patient confirmation;
- queue;
- inventory;
- prescription draft;
- doctor review;
- finalization through existing endpoint;
- truthful communication status;
- manual fallback.

## Testing

- typecheck passes;
- production builds pass;
- unit tests pass;
- integration tests pass;
- endpoint workflow tests pass;
- E2E tests pass;
- accessibility tests pass;
- visual tests pass;
- security audit results are reported honestly.

---

# 16. Final response format

Return:

## Confirmed root causes

- backend connection root cause;
- action/session root cause;
- horizontal dock root cause;
- canvas sizing root cause;
- random particle root cause;
- overexposure root cause.

## Changes made

List exact files.

## Verification

List every command and result.

## Screenshots and recordings

Provide paths.

## Remaining limitations

Do not hide incomplete features.

## Verdict

Use exactly one:

```text
READY FOR CONTROLLED STAGING
NOT READY — RELEASE BLOCKERS FOUND
INCOMPLETE — REQUIRED PROJECT FOLDERS OR SERVICES MISSING
```

Do not use “ready” unless the complete backend, agent, frontend, and endpoint workflow were all tested.
