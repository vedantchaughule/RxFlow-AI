# RxFlow Jarvis Agent

Separate, database-independent Jarvis orchestration service for RxFlow. The main backend owns authentication, clinic data, patient binding, inventory, prescriptions, communications, and audits. This service interprets doctor commands and calls only allowlisted backend tools.

## Start

1. Copy `.env.example` to `.env`.
2. Use the same Jarvis JWT and HMAC secrets as the RxFlow backend.
3. Set `AI_PROVIDER=none` for deterministic built-in commands, or configure OpenAI/Gemini for broader phrasing.
4. Run `npm install`, `npm run typecheck`, then `npm run dev`.

Provider keys and ElevenLabs keys must never be placed in the frontend.
