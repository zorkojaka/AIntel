# Module: projects (backend)

Reviewed at `c0afad8` — depth: deep. Confidence overall: High.

## Purpose & business workflow
Central module of the whole system: project lifecycle from creation through offers,
confirmation, logistics (material + work orders), execution, signature, invoicing.
Supports the flow: Projekt → Ponudba → Potrditev → Delovni nalog + Material → Izvedba →
Predaja → Račun.

## Primary users/roles
SALES/FINANCE/ADMIN (write), ORGANIZER (preparation), EXECUTION (execution updates).
Route-level gates in `routes/index.ts`; payload-shape restrictions for EXECUTION in
`logistics.controller.ts` (`hasPreparationOnly*`).

## Backend surface
- Mounts: `/api/projects` (main), `/api/offers` (offer preview), `/api/settings`
  (pdf-settings sub-route — note: mounted on the settings path from this module).
- Controllers: `project.controller.ts` (1,437 — CRUD, items, status, km, legacy offer
  flow), `offer-version.controller.ts` (1,904 — OfferVersion CRUD/templates/PDF),
  `logistics.controller.ts` (2,927 — confirmation, work orders, material orders,
  execution definitions, availability, PDFs), `invoice.controller.ts` (107 + service).
- Services: invoice (818), document-renderers (1,075, pdfkit), html-pdf (playwright),
  offer PDF variants, document numbering (atomic counters — good), route-distance
  (385, external routing), work-order-confirmation (373), offer-totals,
  offer-from-requirements, template-render.
- Schemas: project (god-doc, see DATA_MODEL), offer-version, work-order,
  material-order, offer-template, pdf-settings.

## Data entities
`projects`, `offerversions`, `workorders`, `materialorders`, `offertemplates`,
`pdfsettings` + `document_number_counters` (settings module).

## Dependencies
cenik (product truth incl. `casovnaNorma`, supplier fields), finance (snapshot on
issue — hard dependency: snapshot failure aborts invoicing, `invoice.service.ts:556`),
communication (send controllers mounted inside projects routes), zahteve, settings,
reviews, employees (assignments/availability).

## Strengths
- Deep, real-world domain modeling: offer versioning per baseTitle; work-order
  confirmation versions with resign states; per-unit execution attribution; time
  tracking; extra items; employee work logs; automatic preparation progression.
- Document numbering via atomic counters.
- Uniform response envelope.

## Problems (top)
1. Legacy embedded arrays (offers/POs/deliveryNotes/workOrders) still routed in parts —
   duplication P1/P2 (DEAD_AND_DUPLICATED_CODE).
2. `invoiceVersions`/`executionDefinitions`/`executionLocations` as `Mixed` — TD-A1.
3. Controller = service layer (TD-A3); logistics controller is the riskiest file in
   the codebase to change.
4. No transactions across confirmOffer / invoice issue flows (TD-D3).
5. Slovenian enum values in material steps (TD-B2); dates as strings (TD-B5).
6. Max+1 project number generation race (TD-B4).
7. km calculation & PDF engines duplicated (P6).

## Testing
None. Highest-priority target for characterization tests (offer totals, invoice
issue, confirmOffer side effects) once logic is extracted from controllers.

## Reuse potential
High — this *is* the product core (project execution engine), but only after: single
source of truth for offers/work orders, schema for invoices, service extraction,
en-neutral status values, tenantId.

## Confidence
Schemas/routes Confirmed; controller behavior High confidence (read structurally, not
line-by-line); runtime behavior not exercised (read-only audit).
