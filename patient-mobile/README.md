# RxFlow Patient Mobile

A separate, mobile-first React/Vite PWA for unauthenticated, token-based patient access. It supports `/appointment/:token`, `/book/:token`, `/reminder/:token`, `/prescription/:token`, and `/scan`.

Configure `VITE_API_BASE_URL` with the backend public API base (including `/api/v1`). The app uses `cache: no-store` for its API calls and its service worker caches only the non-sensitive shell. It does not cache patient data, bearer tokens, or PDFs.

For development, run `npm run dev`; use an HTTPS public tunnel for physical-phone camera testing. See `../md/API_Documentation.md` for token security, ngrok, WhatsApp, and production configuration.
