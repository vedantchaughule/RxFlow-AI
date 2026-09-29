# Remove MyAI Jarvis

## Recommended method

Install the repair on a Git branch. To remove it, restore the commit from before installation or use the reversible module installer supplied in `RxFlow_Jarvis_Repair_Module.zip`.

The module installer records modified files in:

```text
.jarvis-repair-backup/
```

Run its `remove.py` script from the project root to restore modified files and remove files that were added by the module.

## Manual removal map

Delete the added application modules:

```text
jarvis-agent/
backend/src/modules/jarvis/
backend/src/modules/inventory/
frontend/src/features/jarvis/
frontend/src/features/inventory/
frontend/src/experience.css
```

Revert the integration changes in:

```text
backend/.env.example
backend/package.json
backend/src/app.ts
backend/src/config/env.ts
backend/src/modules/communications/communication.service.ts
backend/src/modules/patients/patient.service.ts
backend/src/types/express.d.ts
backend/tsconfig.json
frontend/src/App.tsx
frontend/src/features/prescriptions/PrescriptionEditor.tsx
frontend/src/main.tsx
md/API_Documentation.md
```

Delete `backend/tsconfig.test.json` if it did not exist before this repair, and restore the original backend build configuration through source control.

Remove local-only Jarvis and ElevenLabs environment values. Revoke provider keys that are no longer used.

## Database cleanup

Removing the code does not remove data. Only after a verified backup and an explicit retention decision should an administrator-controlled migration remove:

```text
jarvissessions
jarvisactions
inventorymedicines
```

Do not delete patients, queues, prescriptions, appointments, communications, feedback, or audit records.

## Verify removal

```bash
cd backend && npm run typecheck && npm run build
cd ../frontend && npm run typecheck && npm run build
```

Confirm that these no longer exist:

```text
/api/v1/jarvis
/api/v1/internal/jarvis
/api/v1/inventory
/app/jarvis
/app/inventory
```

Confirm all original manual clinic workflows still function.
