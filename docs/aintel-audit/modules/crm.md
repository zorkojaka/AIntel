# Module: crm (backend) + module-crm (frontend)

Reviewed at `c0afad8` — depth: deep (schemas/routes), survey (frontend).

## Purpose
Customer master data. Two generations coexist:
- **clients** (`crmclients`) — the one actually used by flows (projects, web-inquiries,
  equipment endpoint): name, type company/individual, vat_number, address fields,
  email (lowercase, **not unique**), phone, tags, isActive.
- **people / companies / notes** — earlier CRM entities, still routed and rendered in
  module-crm; relationship to clients undefined (D6 in DEAD_AND_DUPLICATED_CODE).

## Surface
`/api/crm/{people,companies,notes,clients}` — auth only, **no role gate** (any employee
can read/edit all customer PII — Medium finding, USER_ROLES §3).
`ClientForm` component exported from `@aintel/module-crm`, reused by module-projects
("Dodaj stranko") — good cross-module UI reuse.

## Critical gap
CRM is the thinnest critical module (587 lines) for a system whose vision starts at
"lead acquisition": no lead status, no activities/interactions on clients (notes are
entity-generic but unused in flows — Probable), no owner/salesperson, no consent/GDPR
fields, no dedupe (email not unique). AIN-P1-07 added nullable `Project.clientId` for
new rows; legacy rows still require an owner-reviewed backfill report/run (TD-D1).

## Recommendation direction
Make CrmClient the identity anchor: unique-ish email index (sparse) + merge tooling,
complete the Project `clientId` legacy backfill, portal identity link, interaction log
(calls/emails/visits) —
prerequisite for the follow-up/task engine in TARGET_OPERATING_MODEL.

Reuse potential: High (core module by definition) after the above.
Confidence: Confirmed schemas/routes; frontend Probable.
