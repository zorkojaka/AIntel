# Module: settings (backend) + module-settings (frontend)

Reviewed at `c0afad8` — depth: deep (backend), survey (frontend 4.7k lines).

## Purpose
Company identity singleton (name, contact, logo, colors, payment terms, document
prefixes) + `document_number_counters` (atomic numbering used by projects invoicing/
documents). Frontend also hosts PDF settings UI and communication settings UI.

## Surface
`GET/PUT /api/settings` — **PUT unrestricted for any authenticated user** (S4/Medium).
`useSettingsData` hook exported for other modules (CRM, projects) — good.
Seed: `pnpm --filter aintel-backend seed:settings` (do not run — writes DB).

## Notes
- Singleton pattern OK for single tenant; blocks multi-company (needs tenant-scoped
  settings; see MODULARIZATION_PLAN).
- Document counters are the right pattern — extend to project numbers (TD-B4).
- Configuration is fragmented across settings / pdf-settings / communication sender /
  web-inquiry settings / category settings / execution rules (CURRENT_ARCHITECTURE
  §Configuration) — settings module is the natural future home of a unified,
  namespaced config store.

Reuse: High (core). Confidence: Confirmed.
