# START HERE — RxFlow AI with MyAI Jarvis

This project was rebuilt from the uploaded `may10(1).zip` source. The uploaded source contained the clinic backend and frontend, but its `jarvis-agent/` folder was empty and Jarvis was not active in the application.

This repaired source adds Jarvis as a separate service, connects it to the existing RxFlow backend through short-lived doctor sessions and signed internal tool calls, adds medicine inventory, repairs confirmed WhatsApp worker defects, and refreshes the frontend without replacing the existing clinic workflows.

## Important security step

The uploaded source contained a local backend `.env`. That file is **not** included in this release. If it contained active credentials, rotate them before using this project. Create new local `.env` files from the provided `.env.example` files.

Never place OpenAI, Gemini, or ElevenLabs keys in the frontend.

## Included applications

```text
backend/       RxFlow API, MongoDB models, WhatsApp jobs, inventory, Jarvis sessions/tools
frontend/      React/Vite clinic UI, refreshed workspace, inventory page, Jarvis dock/workspace
jarvis-agent/  Separate provider-neutral Jarvis command and tool orchestration service
```

## Local start order

1. Start MongoDB.
2. Configure and start `backend/` on port 5000.
3. Configure and start `jarvis-agent/` on port 5001.
4. Start `frontend/` on port 5173.
5. Sign in as a doctor.
6. Open **Jarvis Assistant** from the sidebar or use the compact bottom-right launcher.

Read [docs/JARVIS_INSTALL.md](docs/JARVIS_INSTALL.md) for exact environment values and commands.

## Provider modes

`AI_PROVIDER=none` supports deterministic built-in commands such as help, queue queries, inventory search, patient lookup patterns, and structured medicine instructions recognized by the local parser.

For broader natural-language understanding, configure either OpenAI or Gemini in the server-side `jarvis-agent/.env`.

ElevenLabs speech is optional. Text mode and browser speech-synthesis fallback remain available when ElevenLabs is disabled.

## Safety boundary

Jarvis may retrieve real clinic data, propose patient binding, and prepare prescription drafts. It cannot independently diagnose, finalize a prescription, change inventory, send a direct patient message, or mark WhatsApp delivery. The doctor and existing RxFlow backend remain authoritative.

## Verification status

Read [TEST_REPORT.md](TEST_REPORT.md). Typechecks, backend/agent TypeScript production builds, parser smoke checks, architecture checks, and live unauthenticated/authenticated HTTP checks passed. Database-backed end-to-end workflows and browser visual tests still require a clean native dependency installation and an available test MongoDB instance.
