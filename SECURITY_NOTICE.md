# Security Notice

The uploaded project archive contained a local backend `.env`. That file is excluded from all repaired release archives.

Before use:

1. Rotate any credential that was present in the uploaded archive if it was active.
2. Generate new access-JWT, refresh-JWT, encryption, platform-support, Jarvis-session, and Jarvis-HMAC secrets.
3. Configure OpenAI, Gemini, ElevenLabs, SMTP, WhatsApp, and payment credentials only in local/deployment secret stores.
4. Never add provider keys to `VITE_*` values or frontend code.
5. Confirm `.env` files remain ignored by Git and excluded from backups shared outside your trusted environment.
6. Run secret scanning on repository history and deployment logs before production deployment.

The repaired package includes only `.env.example` templates with placeholders.
