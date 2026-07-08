# Dead and Duplicated Code — Evidence-Based Candidates

Commit `c0afad8`. Nothing here should be deleted without the listed validation step
(project rule: never delete — move/archive instead). Confidence labels per item.

## Dead-code candidates

| # | Path / symbol | Why it appears unused | Verification performed | Confidence | Safe next validation step |
|---|---|---|---|---|---|
| D1 | `backend/db/seed.ts` | 0 bytes | `wc -l` = 0 | Confirmed empty | Archive file |
| D2 | `docs/30_REALITY.md` | Auto-generated Feb 2026 report, states "NOT DETECTED" for everything | Read fully | Confirmed obsolete | Move to `docs/artifacts/` |
| D3 | Repo root `ExecutionPanel.tsx.bak`, `head_ProjectWorkspace.tsx` | Backup/scratch files at root, not imported | grep for imports (none; root files outside src trees) | High confidence | Archive |
| D4 | `apps/module-projects` legacy embedded-offer UI paths (if any remain calling `POST /projects/:id/offers` legacy controller) | Legacy embedded flow superseded by OfferVersion endpoints | Routes still registered; frontend OffersTab uses `/offers` OfferVersion endpoints (grep) | Probable (routes maybe still hit by old UI paths) | Add temporary logging counter on legacy endpoints in staging; observe 2 weeks |
| D5 | `project.controller.ts` legacy offer confirm/select + `createPurchaseOrders` + embedded deliveryNotes flow (lines ~1042–1226) | Superseded by `logistics.confirmOffer` + MaterialOrder | Route table: only `receiveDelivery` + offer send/select still routed via legacy names — checked imports in `routes/index.ts` | Probable | Trace each exported symbol against routes/index.ts; log-then-remove |
| D6 | `crm` `people`/`companies`/`notes` entities | Flows use `clients`; current module-crm UI uses `/api/crm/clients` only | Routes still mounted; frontend grep finds client-only CRM usage | Probable legacy/secondary | Read-only collection counts with owner consent; D-017 decides consolidation |
| D7 | `dashboardstats` schema + dummy metrics | `/api/dashboard/stats` returns static defaults | Controller traced; active SPA calls `/api/dashboard/installer`, which reads live project/logistics data | Confirmed static legacy endpoint | Decide whether `/stats` should be removed, renamed, or backed by real management metrics |
| D8 | `shared/types/project.js` (compiled JS next to .ts sources) | Build artifact committed | ls of shared/types | Confirmed artifact | Archive; add to .gitignore pattern list (needs explicit approval since it changes tooling) |
| D9 | `apps/module-projects/src/components/ui` vs `packages/ui` overlap | Two UI component sets; names overlap (`Button`, `Card`, `Input`, etc.) | Import grep: module-projects uses local shadcn-style widgets heavily; other modules use `@aintel/ui` | Confirmed overlap | Owner/senior decision before migration; do not mechanically swap on money-path UI |
| D10 | inteligent-si `domovtest.html`, `domovtest2.html`, `indextest.html`, `BS.html`, `tmp/` | Test pages in production website root | Directory listing | High confidence (unused for visitors, still deployed) | Confirm with owner; archive out of web root |

## Duplicated responsibilities

| # | Duplication | Paths | Notes |
|---|---|---|---|
| P1 | Offers: embedded `Project.offers` vs `offerversions` collection | `projects/schemas/project.ts:179-211,339` vs `schemas/offer-version.ts` | The central duplication. Embedded version still written by legacy controller paths (`project.controller.ts:875-884`). Decide single source (OfferVersion), then freeze embedded writes. |
| P2 | Work orders / POs / delivery notes: embedded vs collections | `project.ts:333-335` vs `work-order.ts`, `material-order.ts` | Same pattern as P1. |
| P3 | Customer identity: CrmClient vs Project.customer vs WorkOrder.customer* vs portal Uporabnik | crm/schemas/client.ts, project.ts:308, work-order.ts, portal modeli.js | Signed-document snapshots are legitimate; live-data copies are not distinguished from snapshots. |
| P4 | Product categorization: `kategorija`, `categorySlug`, `categorySlugs[]`, `categories[]` | `cenik/product.model.ts` | Import/migration scripts exist (`migrate-product-categories.ts`) — consolidation started but unfinished. |
| P5 | Material status: `status` (EN) + `materialStatus` (SL) + per-item `materialStep` | `material-order.ts` | Three places to disagree. |
| P6 | PDF generation: pdfkit renderers + playwright HTML pipeline | `document-renderers.ts`, `html-pdf.service.ts`, `invoice-pdf.service.ts`, `offer-*-pdf.service.ts` | Two engines maintained in parallel. |
| P7 | Template rendering: `projects/services/template-render.service.ts` and `communication/services/template-render.service.ts` | both exist | Same name, likely overlapping features — merge candidate (Needs verification of divergence). |
| P8 | Email sending: AIntel communication vs portal `pomozno.js` | two mailers | Consolidation opportunity (INTEGRATION_MAP). |
| P9 | Rate limiting/API-key middleware is duplicated by surface | public routes + auth login limiter | AIN-P3-01 added auth login rate limiting; web-inquiries still has its own public API-key/rate-limit path. Consider shared middleware only if another public surface appears. |
| P10 | CRM people/companies vs clients | crm module | See D6. |

## Explicitly NOT dead (checked, keep)

- `reviews` module: no own router but actively used via public routes + admin routes +
  invoice flow (`{{review.link}}`, commits `896f1ae`, `59b1d55`).
- `backend/scripts/*`: operational tooling (imports, migrations, audits) — dangerous
  but intentional; keep with README warnings.
- `zahteve/predlogi/*` endpoints: consumed by module-projects `api.ts` (grep confirmed).
