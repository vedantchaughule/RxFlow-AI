# Workspace Rules & Guidelines for RxFlow

## Automatic API & Documentation Sync Rule

Whenever you modify, add, or remove any API routes, endpoints, Zod validation schemas, middleware, or database models in this project:

1. **Keep `md/API_Documentation.md` In Sync**:
   - Update the API Reference section for affected endpoints (parameters, HTTP status codes, request/response payloads, error scenarios).
   - Update the Error Codes Catalog if new error codes or status codes are introduced.
   - Update the Permission Matrix if authorization middleware (`requireAuth`, `requireRole`, `requireAdminMfa`, etc.) is changed.
   - Update Database Models and Security Design sections if schemas or security mechanisms change.

2. **Keep Postman Collections In Sync**:
   - Offer or automatically run the `postman-collection-sync` skill to update Postman collections in the Postman workspace after route/schema changes.
