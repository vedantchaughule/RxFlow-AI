# RxFlow MyAI Jarvis — Complete Module

This package is built against the uploaded `may10` RxFlow project structure. It adds a separate Jarvis service, main-backend integration, medicine inventory, a compact dock, a full-screen doctor workspace, stable audio-reactive particle visuals, patient lookup, queue tools, prescription drafts, optional ElevenLabs speech, and reversible installation instructions.

## What is included

```text
backend/src/modules/inventory/
backend/src/modules/jarvis/
frontend/src/features/jarvis/
jarvis-agent/
md/API_Documentation.md updates
```

The visual is original. It does not use Marvel images, logos, movie HUDs, actor likenesses, actor voices, or copyrighted sounds.

## Supported Jarvis tasks

- Find a patient by RxFlow display ID, MongoDB ID, normalized name, or current queue number.
- Resolve duplicate names through doctor selection.
- Confirm the patient before loading clinical context.
- Show remaining, next, current, or full waiting queue information.
- Search medicine inventory and report low/out-of-stock items.
- Show recent prescriptions for the confirmed patient.
- Show actual recorded communication status.
- Parse a medicine instruction into a reviewable prescription draft.
- Apply non-empty draft values to the prescription editor while resetting clinician confirmation.
- Speak responses through optional ElevenLabs, with browser speech synthesis as a fallback.

## Explicitly not autonomous

Jarvis cannot diagnose independently, finalize a prescription, modify stock, send a patient message, or mark a WhatsApp message delivered. The existing RxFlow backend and doctor confirmation remain authoritative.
