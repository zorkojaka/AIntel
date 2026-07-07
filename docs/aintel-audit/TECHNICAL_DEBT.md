# Technical Debt

Commit `c0afad8`. Effort scale: S (<1 day), M (days), L (1–2 weeks), XL (multi-week).
Each item: evidence → business consequence → technical consequence → severity/effort.

## Architecture

| ID | Item | Evidence | Business consequence | Technical consequence | Sev | Effort |
|---|---|---|---|---|---|---|
| TD-A1 | Project god-document with `Mixed` financial fields | `projects/schemas/project.ts:340-343` | Invoices/execution data can silently corrupt; no validation on money documents | No schema evolution path; every consumer re-parses blobs | High | L (promote invoiceVersions to collection first) |
| TD-A2 | Legacy embedded offers/POs/deliveries/workOrders parallel to collections | `project.controller.ts:875-1226` vs `offerversions`/`workorders`/`materialorders` | Two sources of truth; stale UI numbers possible | Confusing writes; migrations blocked | High | M–L |
| TD-A3 | Business logic in controllers | `logistics.controller.ts` (2,927 lines, ~60 helpers) | Changes are risky → slow feature delivery on the core flow | Untestable units; hidden coupling | High | L (extract services incrementally) |
| TD-A4 | No state machine for lifecycles | statuses mutated ad hoc across controllers | Invalid transitions possible; wheel can't be automated | Every automation must re-derive rules | High | L (introduce transition layer) |
| TD-A5 | No background scheduler | no cron/queue anywhere | No follow-ups, SLAs, maintenance — core product vision blocked | Any timed feature needs new infra | High | M (add worker + job store) |
| TD-A6 | Direct cross-module model imports (no interfaces/events) | e.g. web-inquiries imports crm/projects/cenik models; communication ↔ projects | none today | Blocks modular product; refactors ripple | Medium | XL (gradual) |

## Module coupling

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-C1 | communication ↔ projects bidirectional | project routes mount communication controllers; communication reads project schemas | Cannot ship either module alone | Medium | M |
| TD-C2 | web-inquiries hardwired to 6 modules incl. dynamic imports | `public.routes.ts` dynamic `import()` of crm/projects models | Intake breaks when any internal model changes | Medium | M |
| TD-C3 | reviews has no routes of its own; endpoints live in web-inquiries admin + public routers | `routes.ts`, `web-inquiries/admin.routes.ts:153-173` | Ownership confusion | Low | S |

## Code quality (backend)

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-B1 | Hand-rolled validation everywhere; no schema validation lib | all controllers | Inconsistent errors; injection surface | Medium | L (adopt zod at boundaries, incremental) |
| TD-B2 | Slovenian/English mixed identifiers and enum **values** in DB | `product.model.ts` (ime/nabavnaCena), material steps "Za naročiti" | Blocks non-Slovenian tenants; brittle string checks | Medium (High for product) | L (mapping layer) |
| TD-B3 | 4 category fields on Product; 2 status fields on MaterialOrder | `product.model.ts`, `material-order.ts` | Filtering bugs, import confusion | Medium | M |
| TD-B4 | Max+1 ID generation | `generateProjectIdentifiers` (project.ts:393) | Duplicate-key 500s under concurrent creates | Low (single user base) | S (use DocumentCounter) |
| TD-B5 | Dates as strings (project createdAt, scheduledAt, …) | project/work-order schemas | Wrong sorting/range queries; timezone bugs | Medium | M |
| TD-B6 | auth.routes.ts uses DOM `Request`/`Response` types accidentally | `auth.routes.ts` blockNonPost (no express type import) | Type safety illusion | Low | S |
| TD-B7 | RESOLVED (AIN-P1-06): Live prod error: `'undefined'` → ObjectId cast in installer-prep email | pm2 error log; `communication.service` WorkOrder lookup; fixed with controller + service workOrderId guards | Repro now returns 400 instead of reaching Mongo cast path | Medium | Done |

## Frontend

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-F1 | Monolithic panels: ExecutionPanel 3,393 / OffersTab 3,358 / LogisticsPanel 3,113 lines | `apps/module-projects/src/...` | Slow, risky UI changes on the money path | High | L (split by domain, extract hooks) |
| TD-F2 | No shared API client / caching; raw fetch per module | `api.ts` files | Duplicate error handling; inconsistent UX; refetch storms | Medium | M |
| TD-F3 | Hand-rolled routing in shell (path prefixes, no router) | `core-shell/App.tsx` | Deep-linking/back-button quirks | Low | M |
| TD-F4 | Stray files in repo root: `ExecutionPanel.tsx.bak`, `head_ProjectWorkspace.tsx` | repo root | Confusion; accidental imports | Low | S (archive) |

## Database

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-D1 | PARTIAL (AIN-P1-07): new Project rows carry `clientId`; legacy rows still use name fallback and portal identity remains email-based | DATA_MODEL §problems | Legacy wrong-customer data mixing/orphaning remains until owner-reviewed backfill; portal duplicate-email risk remains | High | S/M (review report + backfill, then portal identity) |
| TD-D2 | RESOLVED (AIN-P1-05): `autoIndex:false` now has an explicit ensure-indexes procedure | `db/mongo.ts`, `backend/scripts/ensure-indexes.ts` | Owner still must run dry-run/apply consciously; no automatic boot-time index creation | Medium (Atlas run remains owner-owned) | S (script landed) |
| TD-D3 | No transactions on multi-doc flows (confirmOffer, invoice issue) | logistics/invoice services | Partial writes on failure → stuck projects | Medium | M |
| TD-D4 | Shared prod/staging DB | env layout | Test data pollution; accidental prod damage | High | M (org decision + data copy) |

## Testing

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-T1 | Zero backend tests; no test runner configured in backend/package.json | repo scan | Every deploy is a production experiment (on shared DB!) | High | started S, ongoing |
| TD-T2 | 4 UI-kit tests only; core flows untested | packages/ui | Regressions in offers/invoices unnoticed | High | ongoing |
| TD-T3 | Testability blocked by controller-embedded logic + no DI + live-DB coupling | TD-A3/A6 | Unit tests impossible without refactor; integration tests dangerous on shared DB | High | with TD-A3 |

## Runtime & deployment

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-R1 | 58,165 PM2 restarts on `aintel` | `pm2 describe aintel`; error-log analysis in `specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-04 | **RESOLVED (cause, spec pass 2026-07-05)**: historical boot crash-loop — older build hard-required `AINTEL_ALLOWED_ORIGINS`; current source falls back to defaults. Follow-up debt: no PM2 backoff guardrails (`max_restarts`/`min_uptime`) → a future boot misconfig could loop again | Low (guardrails pending) | S (owner config) |
| TD-R2 | No health-based restart/alerting; /health exists but nothing consumes it | repo, VPS | Outages noticed by humans | Medium | S–M |
| TD-R3 | Playwright as prod dependency for PDF (heavy, browser download on install) | backend/package.json | Slow deploys, larger attack surface | Low | M (consolidate on one PDF path) |

## Observability

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-O1 | console.log only; no levels/structure/correlation | codebase | Debugging via grep on PM2 logs; no error budget | High | M (pino + request ids) |
| TD-O2 | No error tracking (Sentry etc.) | codebase | Prod errors (e.g. TD-B7) discovered by accident | High | S |
| TD-O3 | No metrics (request rates, email failures, inquiry conversion) | codebase | Management flies blind; no SLO possible | Medium | M |

## Documentation

| ID | Item | Evidence | Consequence | Sev | Effort |
|---|---|---|---|---|---|
| TD-X1 | RESOLVED (AIN-P3-08 partial): stale docs now carry superseded banners | `docs/ARHITEKTURA.md`, `docs/MODULES.md` | Residual risk only if readers ignore the banner | Low | done |
| TD-X2 | RESOLVED (AIN-P3-08 partial): `docs/30_REALITY.md` marked archival/stale | file | Residual noise only | Low | done |
| TD-X3 | RESOLVED (AIN-P3-08 partial): route reference added | `docs/aintel-audit/API_ROUTE_REFERENCE.md` | Must be kept updated with route changes | Low | same-PR docs updates |
