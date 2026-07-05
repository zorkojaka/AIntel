# Module: finance (backend) + module-finance (frontend)

Reviewed at `c0afad8` — depth: deep (routes/schemas), survey (analytics internals).

## Purpose
Financial read-model and analytics: entries from invoices, immutable snapshots at
invoice issue (incl. per-employee earnings), summaries, product analytics
(frequency, co-occurrence, bundles, basket), pipeline.

## Surface
`/api/finance` — **no role gate (S4, High)**: list entries, addFromInvoice,
yearly/monthly summary, project/client finance, snapshots (list/by project),
invoices list, product analytics, employees summary, employee earning detail +
**PATCH payment status** (`routes/index.ts:40`), pipeline.

## Data
- `financeentries` — per-invoice records.
- `financesnapshots` — created by `projects/services/invoice.service.ts` during issue
  (hard dependency; snapshot failure aborts invoicing — deliberate consistency choice,
  `invoice.service.ts:556`). Contains items + employee earnings with payment tracking.

## Notes
- Direction of dependency is projects → finance (snapshot creation), finance module
  itself is mostly read-side. Reasonable CQRS-ish split.
- `addFromInvoice` POST suggests a manual/second write path parallel to the automatic
  snapshot — duplication of intent (Needs verification which one the UI uses).
- Employee earnings + payment status here overlap conceptually with
  employee-profiles service rates — the payroll story spans three modules
  (finance, employees, employee-profiles) without a single owner.
- No tenantId; snapshots embed employee ids.

## Frontend
module-finance (1.3k lines): tables, charts, stat cards. Not deeply reviewed.

## Reuse potential
Medium — snapshot/read-model idea is generic; analytics are somewhat
retail-specific but configurable.

## Priority fixes
1. Role gate ADMIN+FINANCE (P0-level, one line in routes.ts).
2. Clarify addFromInvoice vs automatic snapshot (then retire one).
3. Invoice **payment** tracking (customer side) is absent — see CURRENT_USER_FLOWS §11.

Confidence: High for routes/schemas; Probable for analytics internals.
