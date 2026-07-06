# Core vs. Custom Classification

Commit `c0afad8`. Basis for MODULARIZATION_PLAN. Classification of what exists today.

## A. Generic core (required by most companies)

| Capability | Current implementation | Readiness as core |
|---|---|---|
| Users & sessions | auth + users modules | Good; add rate limit/2FA |
| People/roles | employees, employee-profiles, profile | Good; roles hardcoded 5-set |
| Roles & permissions | requireRoles + per-mount gates | Works; needs default-deny policy + config-driven roles |
| Customers & contacts | crm (clients) | Too thin; needs identity anchoring (clientId), interactions |
| Tenancy | tenantId on identity modules only; `resolveTenantId` header hack | Not ready — partial and unsafe |
| Documents & numbering | document counters, pdf-settings, PDF services | Numbering good; PDF duplicated engines |
| Notifications/communication log | communication module | Strong concept; decouple from project schemas |
| Files/photos | files, photos, uploads | Needs auth + single storage service |
| Configuration | settings + 5 scattered config stores | Fragmented; unify |
| Dashboards | dashboard module (stub) + finance analytics | Early |
| Audit logs | project timeline + communication events only | No generic audit trail |
| Tasks & next actions | **absent** | Must be built (the wheel's hub) |
| Scheduler/automation | **absent** | Must be built |

## B. Optional reusable modules (exists, extractable after cleanup)

- **CRM & inquiries**: crm + web-inquiries intake framework (minus pillar rules).
- **Quotation & pricing**: offer versions, totals/discount engine, offer templates,
  PDF; depends on price list.
- **Price list & procurement data**: cenik (products/services, imports, links).
- **Project execution**: work orders, execution units, time tracking, signature/
  confirmation versions, material preparation, scheduling.
- **Field evidence**: photos + PhotoCapture/Manager UI.
- **Invoicing handoff**: invoice versions → finance snapshot → analytics.
- **Customer portal**: inteligent-portal (separate app; would need rebuild on shared
  identity).
- **Reviews**: token reviews + moderation + Google redirect.
- **Communication**: templated multi-category email hub.

## C. Inteligent-specific configuration (today hardcoded, should become config/data)

- Pillars & verticals: videonadzor / wifi_kamere / alarm / domofon / pametna_hisa
  enums in zahteve, web-inquiries validation and builders, module-projects Zahteva UI
  sections.
- Product classification schema (camera housing, NVR channels, PoE, disk…) in
  `product.model.ts` + predlogi selection rules in zahteve.
- Slovenian enum **values** in DB (material steps, zahteva statuses, execution
  scenarios) and Slovenian-only UI/emails.
- Document conventions: PRJ- prefix, offer numbering style, VAT 22/9.5 dual-rate
  logic, ogled fee text in `NEXT_STEP_MESSAGES` (public.routes.ts), review
  auto-publish threshold (4–5★), discount-by-offer-value bands.
- AA (Alarm Automatika) supplier sync, git-import data files under
  `backend/data/cenik/`.
- inteligent.si widget branding/config.

## D. Hard-coded coupling requiring refactoring (blockers)

1. `resolveTenantId` header fallback + default `'inteligent'` constant (also in
   bootstrap, web-inquiry service default param) — tenant must be session-derived.
2. Cross-module model imports (web-inquiries → 6 modules; communication ↔ projects;
   middleware → users/employees is acceptable core).
3. Project `Mixed` fields and legacy embedded arrays — no clean data contract to
   extract modules against.
4. Client↔project by name, portal↔client by email — identity has no stable keys.
5. VAT rates and totals logic spread through offer-version schema fields
   (totalVat22/totalVat95 as named fields!) — tax model hardcoded into schema.
6. Slovenian enum values in persisted data (migration needed, not just i18n).
7. Frontend static module registry (core-shell App.tsx) — no activation/config
   mechanism per tenant.
8. Single global settings document; no per-tenant config storage.
9. `/uploads` path constants (`/var/www/aintel/uploads`) baked into three modules.

## Proposed ownership boundaries (target)

- **platform-core**: auth/users/employees/roles, tenancy, config store, audit log,
  storage service, communication hub, scheduler+tasks, numbering.
- **crm**: clients (identity anchor), interactions, inquiries intake framework.
- **catalog**: products/services, imports, classification-as-config.
- **sales**: requirements (template-driven), offers, pricing rules.
- **operations**: work orders, material, scheduling, execution, evidence, handover.
- **billing**: invoices, snapshots, analytics, (future) payments.
- **verticals/security-systems** (Inteligent's): pillar definitions, classification
  schema, predlogi rules, templates, texts.

## Required extension points (do not exist today)

- Vertical definition: requirement forms + validation + offer-builder rules as data
  (requirement-templates + execution-rules are the embryo).
- Tax/VAT strategy per tenant/country.
- Document numbering pattern per tenant.
- Email template set per tenant (exists per category already — closest to ready).
- Module activation per tenant (backend mounts + frontend registry).
