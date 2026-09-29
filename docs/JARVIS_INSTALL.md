# Install and Run MyAI Jarvis

## Requirements

- Complete project folders: `backend/`, `frontend/`, and `jarvis-agent/`
- Node.js compatible with the project dependencies
- MongoDB replica-set-capable environment for transactional tests/workflows
- A clean operating-system-native dependency installation

Do not reuse archived `node_modules` directories from another operating system.

## 1. Create new secrets

Copy the example files locally:

```bash
cp backend/.env.example backend/.env
cp jarvis-agent/.env.example jarvis-agent/.env
```

Create different 64+ character values for:

```text
JARVIS_SESSION_JWT_SECRET
JARVIS_INTERNAL_HMAC_SECRET
```

The corresponding backend and agent values must match.

## 2. Backend configuration

```env
JARVIS_ENABLED=true
JARVIS_AGENT_URL=http://localhost:5001
JARVIS_SESSION_JWT_SECRET=<new-shared-session-secret>
JARVIS_INTERNAL_HMAC_SECRET=<new-shared-hmac-secret>
JARVIS_SESSION_TTL_SECONDS=300
JARVIS_INTERNAL_MAX_SKEW_SECONDS=60
```

Complete all existing MongoDB, JWT, encryption, CORS, email, and clinic configuration from `backend/.env.example`.

## 3. Agent configuration

```env
NODE_ENV=development
PORT=5001
JARVIS_PUBLIC_URL=http://localhost:5001
JARVIS_ALLOWED_ORIGINS=http://localhost:5173
RXFLOW_BACKEND_URL=http://localhost:5000
JARVIS_SESSION_JWT_SECRET=<same-session-secret-as-backend>
JARVIS_INTERNAL_HMAC_SECRET=<same-hmac-secret-as-backend>
AI_PROVIDER=none
```

`AI_PROVIDER=none` supports deterministic built-in commands. For broader language, configure one server-side provider:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=<server-side-key>
OPENAI_MODEL=<supported-model>
```

or:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<server-side-key>
GEMINI_MODEL=<supported-model>
```

Optional original voice output:

```env
ELEVENLABS_ENABLED=true
ELEVENLABS_API_KEY=<server-side-key>
ELEVENLABS_VOICE_ID=<original-voice-id>
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
```

## 4. Install dependencies cleanly

```bash
rm -rf backend/node_modules frontend/node_modules jarvis-agent/node_modules

cd backend && npm ci
cd ../frontend && npm ci
cd ../jarvis-agent && npm install
```

The agent package does not include a generated lockfile because the packaging environment could not access the package registry. Generate and commit one after a trusted clean installation.

## 5. Verify before starting

```bash
cd backend
npm run typecheck
npm run build
npm run test:unit
npm run test:integration

cd ../jarvis-agent
npm run typecheck
npm run build
npm run test:smoke
npm test

cd ../frontend
npm run typecheck
npm run build
npm run test:unit
npm run test:e2e
npm run test:a11y
npm run test:visual
```

## 6. Start services

Use separate terminals, in this order:

```bash
cd backend && npm run dev
cd jarvis-agent && npm run dev
cd frontend && npm run dev
```

Expected local URLs:

```text
Backend:       http://localhost:5000
Jarvis agent:  http://localhost:5001
Frontend:      http://localhost:5173
```

Sign in as a doctor. Use the sidebar **Jarvis Assistant** route or the compact bottom-right launcher.

## 7. Useful diagnostics

```text
GET http://localhost:5000/health
GET http://localhost:5000/ready
GET http://localhost:5001/health
GET http://localhost:5001/ready
GET /api/v1/jarvis/diagnostics   (authenticated doctor)
```

A provider or voice failure must leave the manual clinic workflow available.
