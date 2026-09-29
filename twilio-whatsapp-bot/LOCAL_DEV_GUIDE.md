# Twilio WhatsApp Bot — Local Development Guide

This guide explains how to run the standalone Twilio WhatsApp Auto-Booking service locally for development and testing.

---

## Prerequisites

| Tool | Purpose |
|---|---|
| Node.js 18+ | Runtime |
| npm | Package manager |
| ngrok | Expose local port 4300 to a public URL for Twilio webhooks |
| Twilio Account | Provides `ACCOUNT_SID`, `AUTH_TOKEN`, and WhatsApp Sandbox |
| RxFlow Backend | Must be running on `http://localhost:5000` |

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in your real credentials:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Bot HTTP port | `4300` |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token | `(from Twilio Console)` |
| `TWILIO_WHATSAPP_FROM` | Twilio Sandbox WhatsApp number | `whatsapp:+14155238886` |
| `PUBLIC_WEBHOOK_BASE_URL` | Your ngrok public URL | `https://abc123.ngrok-free.app` |
| `RXFLOW_API_URL` | RxFlow backend base URL | `http://localhost:5000` |
| `RXFLOW_WHATSAPP_SERVICE_KEY` | Shared service key for internal API auth | `(generate a 32+ char random string)` |

> **⚠️ NEVER commit `.env` or credentials to source control.**
> The `.gitignore` already excludes `.env` and `.env.*` (except `.env.example`).

---

## 2. Terminal Setup (Three Terminals)

### Terminal 1 — RxFlow Backend

```bash
cd c:\Users\chaug\Downloads\RxFlow_AI_Repaired_With_Working_Jarvis
npm start
```

Runs the main RxFlow backend on port **5000** (default).

### Terminal 2 — Twilio WhatsApp Bot

```bash
cd c:\Users\chaug\Downloads\RxFlow_AI_Repaired_With_Working_Jarvis\twilio-whatsapp-bot
npm install
npm run dev
```

Starts the bot service on port **4300** with hot-reload via `tsx watch`.

### Terminal 3 — ngrok Tunnel

```bash
ngrok http 4300
```

ngrok will display a public forwarding URL, e.g.:

```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:4300
```

Copy the `https://...` URL — you'll need it for Twilio Sandbox configuration and the `PUBLIC_WEBHOOK_BASE_URL` env variable.

---

## 3. Configure Twilio WhatsApp Sandbox

1. Open [Twilio Console → Messaging → Try It Out → Send a WhatsApp Message](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn).
2. Navigate to **Sandbox Settings**.
3. Set the **"When a message comes in"** webhook to:

   ```
   https://<ngrok-host>/webhooks/twilio/whatsapp
   ```

   HTTP Method: **POST**

4. Set the **"Status callback URL"** to:

   ```
   https://<ngrok-host>/webhooks/twilio/status
   ```

   HTTP Method: **POST**

5. Click **Save**.

---

## 4. Join the Twilio Sandbox

Every WhatsApp number that wants to interact with the bot during development **must first join the Twilio Sandbox**.

1. On the Twilio Sandbox page, note the **join phrase** (e.g., `join <word>-<word>`).
2. From your personal WhatsApp, send the join phrase to the Twilio Sandbox number: **+1 415 523 8886**.
3. You should receive a confirmation: _"You are now connected to the sandbox."_

> **Note:** Each developer's phone must independently join the sandbox. The join phrase is unique to your Twilio account.

---

## 5. Verify the Setup

### Health Check

```bash
curl http://localhost:4300/health
# Expected: {"status":"ok","service":"twilio-whatsapp-bot","timestamp":"..."}
```

### Readiness Check

```bash
curl http://localhost:4300/ready
# Expected: {"status":"ready","service":"twilio-whatsapp-bot","environment":"development","twilioConfigured":true}
```

### End-to-End WhatsApp Test

1. From your joined WhatsApp number, send any message (e.g., `Hi`) to the Twilio Sandbox number.
2. The bot should reply with: `Welcome to RxFlow Clinic! Reply 1 to Book an Appointment, or CANCEL to exit.`
3. Check the Terminal 2 console for incoming webhook logs.

---

## 6. Security Notes

- **Twilio Signature Validation**: Every incoming webhook request is validated using the `X-Twilio-Signature` header and your `TWILIO_AUTH_TOKEN`. Invalid signatures are rejected with `403`.
- **Rate Limiting**: Webhook endpoints are rate-limited to 60 requests/minute per IP in development.
- **Phone Redaction**: Phone numbers are redacted in all log output (e.g., `+91****3210`).
- **Idempotency**: Duplicate `MessageSid` values are silently deduplicated.
- **ngrok Credentials**: Do not automate or store ngrok auth tokens in source control. Run `ngrok http 4300` manually each session.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Bot doesn't respond to WhatsApp messages | Check ngrok is running and the webhook URL in Twilio console matches the current ngrok URL |
| `403 INVALID_SIGNATURE` errors | Ensure `TWILIO_AUTH_TOKEN` in `.env` matches your Twilio account. Ensure `PUBLIC_WEBHOOK_BASE_URL` matches the current ngrok URL |
| `ECONNREFUSED` on RxFlow API calls | Ensure RxFlow backend is running on port 5000 (Terminal 1) |
| WhatsApp says "This message could not be delivered" | Make sure you've joined the Twilio Sandbox first |
