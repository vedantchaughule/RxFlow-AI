# Twilio WhatsApp Auto-Booking Service for RxFlow

Standalone microservice for handling Twilio WhatsApp appointment booking via inbound messages, conversation state machine transitions, and integration with RxFlow backend APIs.

## Quick Start

```bash
cp .env.example .env    # Fill in your Twilio credentials
npm install
npm run dev             # Starts on port 4300 with hot-reload
```

See **[LOCAL_DEV_GUIDE.md](./LOCAL_DEV_GUIDE.md)** for the full 3-terminal local development setup with ngrok and Twilio Sandbox.

## Directory Structure

```text
twilio-whatsapp-bot/
  src/
    config/
      env.ts              # Zod-validated environment variables
    routes/
      health.routes.ts    # GET /health, GET /ready
      whatsapp.routes.ts  # POST /webhooks/twilio/whatsapp
      status.routes.ts    # POST /webhooks/twilio/status
    twilio/
      twilio.client.ts    # Twilio Node SDK client
      validate-webhook.ts # X-Twilio-Signature validation middleware
      whatsapp-message.ts # Outbound message sender
    conversation/
      conversation.types.ts   # BookingState, ConversationSession types
      conversation.service.ts # Inbound message processor
      conversation.store.ts   # In-memory session store (1h TTL)
      booking-machine.ts      # State machine transition engine
    rxflow/
      rxflow.client.ts    # HTTP client for RxFlow internal booking API
      rxflow.types.ts     # RxFlow API response types
    security/
      rate-limit.ts       # Express rate limiter (60 req/min)
      redaction.ts        # Phone number redaction for logs
    shared/
      errors.ts           # AppError base class
    app.ts                # Express app factory
    server.ts             # HTTP server bootstrap
  tests/
    unit/
      health.test.ts
    integration/
      webhook.test.ts
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run Vitest test suite |

## Environment Variables

See **[.env.example](./.env.example)** for the full list. Key variables:

- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio credentials
- `TWILIO_WHATSAPP_FROM` — Sandbox number (default: `whatsapp:+14155238886`)
- `PUBLIC_WEBHOOK_BASE_URL` — Your ngrok public URL
- `RXFLOW_API_URL` — RxFlow backend (default: `http://localhost:5000`)
- `RXFLOW_WHATSAPP_SERVICE_KEY` — Shared service key for internal API auth
