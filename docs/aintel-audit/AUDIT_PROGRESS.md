# Audit Progress

Last updated: 2026-07-10 (AIN-P2-04 communication send pipeline)
Last reviewed commit: AIN-P2-04 communication send pipeline on branch `codex/web-inquiries-intake`

**THE FOUNDATIONAL AUDIT IS COMPLETE.** All phases done, P0 specs written
(`specs/P0_IMPLEMENTATION_SPECS.md`), and a final senior review pass
(`FABLE_FINAL_REVIEW.md`) verified the load-bearing findings against source and
corrected the stale points. **Do not re-audit** — implement per
`IMPLEMENTATION_SEQUENCE.md`. Update this file only when an area is re-reviewed after
code changes.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Orientation and inventory | ✅ Complete |
| 2 | Architecture and shared foundations | ✅ Complete |
| 3 | Backend modules | ✅ Complete (core deep, small modules grouped) |
| 4 | Frontend modules and user flows | ✅ Complete (module-projects deep, others surveyed) |
| 5 | Related applications and integrations | ✅ Complete (boundary depth) |
| 6 | Product and modularization analysis | ✅ Complete |
| 7 | Prioritization and handoff | ✅ Complete |
| 8 | P0 implementation specs (verified against code) | ✅ Complete |
| 9 | Final senior review + corrections | ✅ Complete (FABLE_FINAL_REVIEW.md) |

Full audit documentation set produced in `docs/aintel-audit/`. All required documents
exist. `npx tsc --noEmit` in backend = exit 0 at this commit.

## Depth of review by area

- **Deep (read schemas + routes + controller/service structure)**: core framework
  (app/server/mongo/auth/roles/tenant/response/error), projects (schemas, routes,
  controller function inventory, offer/work-order/material schemas), cenik (product
  model + routes + sync layout), communication (service surface + routes),
  web-inquiries (public + admin + service), finance (routes + snapshot dependency),
  zahteve (model + routes), settings, crm (schemas + routes), auth module.
- **Survey (purpose + routes + sizes, internals sampled)**: admin, dashboard,
  categories, requirement-templates, execution-rules, reviews, photos, files, users,
  employees, employee-profiles, profile; frontend module-projects (structure + file
  sizes, key components identified), core-shell (deep), other frontend modules,
  packages/ui+theme, shared/types+utils.
- **Boundary depth**: inteligent-si (widget config, public key exposure, deploy
  relationship), inteligent-portal (server.js, equipment API consumption, separate DB).

## Confirmed key facts (evidence in the topic docs)

- 22 backend modules, 10 frontend apps, 35 schema/model files.
- Modular monolith; compile-time module registry in core-shell App.tsx.
- Auth: JWT cookie, roles on Employee (User fallback), ADMIN bypasses requireRoles.
- `/api/public` mounted pre-CORS/auth. AIN-P0-01 split browser endpoints from
  server-to-server `/clients/*` routes: the latter now require
  `AINTEL_INTERNAL_API_KEY`; owner still must roll env/website secrets.
- Finance company routes and settings writes are role-gated by AIN-P0-02; installers
  keep a server-scoped `/finance/my/earnings` self view.
- AIN-P2-09 removed client-controlled `x-tenant-id`/`x-user-id` trust from tenant/actor
  helpers and removed frontend `buildTenantHeaders` sends. Multi-tenant data scoping
  still requires AIN-P2-10.
- No scheduler/cron (crontab empty); baseline had no backend tests. AIN-P0-03,
  AIN-P1-06, AIN-P1-04, and AIN-P0-02 added focused backend `node:test` coverage for
  upload auth/path resolution, installer-prep ObjectId guards, the five money-flow
  smoke path, and finance/settings authorization on `mongodb-memory-server`.
- Prod `aintel` PM2 restarts = 58,165 — **RESOLVED**: historical boot crash-loop
  (`AINTEL_ALLOWED_ORIGINS` hard-required by an older build), already fixed in current
  source; see `specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-04.
- Live prod error TD-B7 (installer-prep ObjectId('undefined') cast) is resolved by
  AIN-P1-06 guards; no live log check was run after code change.
- autoIndex:false in db/mongo.ts; AIN-P1-05 added an explicit dry-run/apply
  ensure-indexes script and hot-path schema declarations, but owner still controls any
  Atlas run.
- AIN-P1-07 added nullable `Project.clientId`; new manual and web-inquiry projects set
  it, the portal equipment endpoint uses `clientId` with a legacy `customer.name`
  fallback, and the included backfill report is read-only/owner-reviewed before any
  future DB-writing backfill.
- Prod/staging share db `inteligent`.
- Final review re-verified all load-bearing P0/architecture claims against source —
  all confirmed; evidence table in `FABLE_FINAL_REVIEW.md` §1.

## Implementation updates after the foundational audit

- **AIN-P0-03**: `/uploads/*` serving changed from anonymous static files to an
  authenticated streaming route with path-traversal protection. Source grep found no
  embedded `<img ... /uploads ...>` communication/template references in the checked
  source paths. S2 is marked resolved; per-entity upload ownership remains future
  hardening.
- **AIN-P0-01**: `/api/public/clients/*` now lives on an internal sub-router with
  non-browser CORS and `AINTEL_INTERNAL_API_KEY` only. Browser widget/review endpoints
  remain on `AINTEL_WEB_INQUIRY_API_KEY`. Tests cover browser-key rejection on
  `/clients/equipment`, internal-key success, and browser-key success on `/options`.
  Owner still needs to set env secrets and rotate website/portal keys.
- **AIN-P1-06**: installer-prep email now rejects missing/invalid `workOrderId` in both
  controller and service before WorkOrder lookup. Minimal acceptance derived from the
  backlog text: `workOrderId=undefined` returns clean 400 and invalid service input
  cannot reach the Mongo ObjectId cast path.
- **AIN-P1-04**: added an in-memory MongoDB backend smoke test for inquiry→offer,
  offer confirmation→WO+MO, preparation advance, execution signature, and invoice
  issue→finance snapshot. Uses the existing `node:test` harness; SMTP is not exercised
  because inquiry auto-email is disabled in the test fixture.
- **AIN-P0-02**: finance company endpoints are ADMIN/FINANCE, payment PATCH is
  ADMIN/FINANCE, settings/pdf-settings/communication settings writes are ADMIN, and
  installers use `/finance/my/earnings` with server-side employee scoping. D-012 was
  resolved with the spec default: SALES does not get company finance read access —
  owner-confirmed 2026-07-06 (review sign-off); task DONE. Rollout note: backend and
  SPA must deploy together (the SPA switch to `/my/earnings` and the `/snapshots` gate
  landed in one commit).
- **AIN-P1-05**: added `backend/scripts/ensure-indexes.ts` with read-only dry-run
  planning and guarded apply mode, plus hot-path schema indexes for `projects`,
  `workorders`, and `materialorders`. No Atlas `listIndexes`/createIndex run was done
  by the agent; owner must run it consciously.
- **AIN-P1-07**: added nullable `clientId` to Project and linked both manual project
  creation and web-inquiry project creation to active `CrmClient` records. The portal
  equipment endpoint now joins by `clientId` first with legacy `customer.name`
  fallback. Added a read-only backfill report helper; no shared-DB report or write was
  run by the agent.
- **AIN-P2-09**: `resolveTenantId`/`resolveActorId` ignore spoofable tenant/user
  headers and derive from session context/user fallbacks; module-projects no longer
  sends `buildTenantHeaders`. Tests cover spoofed header rejection and the
  single-tenant unauthenticated fallback.
- **AIN-P3-08 partial**: stale legacy docs already carry superseded/archival banners,
  and `API_ROUTE_REFERENCE.md` now documents current Express mounts and route groups.
  Dead-file archiving remains owner-approved only.
- **S8 communication template escaping**: factored email body HTML rendering into a
  tested helper that escapes interpolated customer-controlled values and appends
  already-rendered escaped footer HTML. Broader input-surface hardening remains open.
- **Finance write-path check**: `addFromInvoice` is a disabled 410 legacy route and the
  frontend does not call it; invoice issue remains the authoritative
  `createFinanceSnapshot` write path.
- **CRM/dashboard/UI usage check**: module-crm uses `/api/crm/clients` only while
  people/companies/notes remain backend-routed legacy entities; active dashboard UI
  uses live `/api/dashboard/installer` data while `/stats` remains static defaults;
  module-projects has a local shadcn-style `components/ui` set alongside shared
  `@aintel/ui`.
- **Zahteve v6 tracking check**: no explicit schema/migration version marker exists on
  Zahteva documents or frontend types. v6 is shape-inferred by `sistemi[]` and absence
  of legacy top-level fields; migration scripts are manual DB writers and were not run
  from staging.
- **AIN-P1-01 agent support**: shared email transport now supports env-driven staging
  trap (`AINTEL_EMAIL_TRAP_TO`, `AINTEL_EMAIL_SUBJECT_PREFIX`) with tests and an owner
  rollout runbook. Staging DB split remains owner-owned and not yet verified.
- **AIN-P1-09 follow-up**: by-subject task strips now render on project detail pages
  and expanded web-inquiry rows, backed by the existing `/api/tasks/by-subject/:kind/:id`
  API. Owner visual review remains.
- **AIN-P1-10 scheduler worker**: added env-gated `node-cron` scheduler foundation
  (`AINTEL_SCHEDULER_ENABLED=true`) with Mongo lease locks, run log, Sentry/log
  failure reporting, declared indexes, and a first task SLA sweep job. It is disabled
  by default to avoid accidental writes to the shared staging/prod DB before owner ops
  verification.
- **AIN-P3-01**: auth login now has a tested in-memory/per-process failed-attempt
  limiter. Optional 2FA and distributed/session revocation remain future scope.
- **TD-B6**: auth route `blockNonPost` now uses Express `Request`/`Response`/
  `NextFunction` types instead of accidental DOM globals.
- **Docs drift cleanup**: `CURRENT_ARCHITECTURE.md` and `INTEGRATION_MAP.md` now reflect
  the authenticated `/uploads/*` route introduced by AIN-P0-03.
- **AIN-P3-02 DONE**: added shared frontend API envelope parser/helper and moved
  core-shell auth, module-settings, module-projects, module-employees,
  module-profil, module-finance, module-crm, module-dashboard, and module-cenik
  API parsing to it; module-employees form/service-rate helper,
  module-settings secondary sections, selected module-projects hooks, project
  load, timeline/project workspace fetches, ProjectsPage CRUD/list operations,
  OffersTab offer/template/assignment transport, logistics/execution standard
  fetches, and price-list autocomplete also use it. Shared `fetchApi` now has
  opt-in retry and a standardized error-reporting hook. Remaining grep hits are
  intentional special cases: custom category `options`, logistics email non-JSON
  fallback, and cenik 409 duplicate-precheck conflict data.
- **AIN-P1-03 structured logging**: added `pino` + a `pino-http` middleware mounted
  first in `createApp`, so every request (incl. `/api/public`) emits one JSON line with
  a request id (echoed on `x-request-id`), method/url, tenant/user/route from
  `req.context`, status, and latency. `errorHandler` logs 500s with full stack via
  `req.log`. Named `console.*` in core/communication-sends/public-intake migrated to the
  structured logger. Prod/test = JSON; dev = `pino-pretty` on a TTY; tests silent.
  Verified via smoke + `npm run build` + 29 backend tests green. Owner approved the
  `pino` dependency 2026-07-08.
- **AIN-P1-02 error tracking**: added `@sentry/node` behind `core/sentry.ts` +
  `instrument.ts` (loaded first in `server.ts`). Optional — no `SENTRY_DSN` means the app
  runs with tracking disabled. 500s forwarded from `errorHandler` with scrubbed context
  (request id, route, method, status, environment, release, minimal user = id + primary
  role). `sendDefaultPii:false` + `beforeSend` strip cookies/body/query/auth+API-key
  headers. EU residency carried by the DSN (`*.ingest.de.sentry.io`). Owner chose Sentry
  EU 2026-07-08; must create the EU project and set env secrets. Verified via
  `test/sentry-scrub.test.ts` (disabled no-op, enabled path, scrub) + 32 tests green.
  Frontend SPA capture remains a follow-up.
- **AIN-P1-13 follow-up e-mail from task**: `offer.follow_up` tasks now support a
  manual preview/send flow from Opravila, including a batch checkbox view. Backend
  endpoints validate the task type/status, render active `offer_follow_up` templates
  with offer context (safe fallback if missing), send through the existing offer
  communication module with PDF offer attachment, and complete the task only after a
  successful send. Failed sends leave the task open. Covered by
  `test/task-follow-up-email.test.ts`; no automatic sending was added.
- **AIN-P1-17 motivational project progress**: module-projects now shows a
  motivational progress bar in the internal project workspace, derived from the
  existing timeline steps. It starts above 0 %, displays active step and completed
  count, and shows a near-finish message on the final step. This is presentational
  only; public configurator/web-side progress remains ECO-36 outside this repo.
- **AIN-P1-19 configurator value payload**: browser `POST /api/public/inquiries`
  keeps the existing `offerSummary` price fields and adds a customer-facing `value`
  payload for automatic offers: equipment from actual offer items + cenik
  descriptions/images, included services with a safe fallback, coverage mapped from
  configurator answers, and reassurance copy. Internal `defaultsApplied` automation
  notes remain private. Covered by the money-flow smoke test on memory Mongo.
- **AIN-P2-07 mutation audit logging**: protected `/api` POST/PUT/PATCH/DELETE routes
  now emit a structured `audit.mutation` log event after the response finishes. Events
  include auth-derived tenant/actor/roles, route, method, status, request id,
  best-effort module/entity id, and sensitive-key-filtered top-level changed field
  names. This is log-based auditability, not a new immutable database collection.
- **AIN-P2-05 supplier normalization and late delivery**: material order items now
  receive a normalized `supplierKey` while preserving display supplier fields, material
  orders can store `expectedAt`, and the preparation UI can edit that date. Added a
  disabled-by-default `material.late_delivery` wheel rule and scheduler job that create
  ORGANIZER tasks for overdue, not-yet-ready material orders with deterministic
  dedupe keys. No DB migration or shared-DB script was run.
- **AIN-P2-01 legacy embedded write freeze**: legacy embedded project write functions
  in `project.controller.ts` now fail closed with HTTP 410 and emit structured
  `legacy.project_embedded_write` warning events. The still-mounted embedded delivery
  receive route is blocked before DB access; unmounted embedded offer actions are also
  guarded if accidentally re-mounted. The collection-backed OfferVersion,
  MaterialOrder, and WorkOrder APIs remain the active paths.
- **AIN-P2-04 communication send pipeline**: offer, invoice, work-order confirmation,
  and installer-preparation sends now share one internal delivery/record/event helper
  for `sendEmail`, inline company logo attachments, `communication_messages`, provider
  message ids, and sent/failed `communication_events`. Domain-specific template
  contexts and attachment selection stay in their send functions; installer
  preparation keeps preview-only and "sent but logging failed" behavior.

## Genuine unresolved checks (curated in the final review)

Resolved/folded since the original list: PM2 restarts (#old-1 → resolved, above);
storage read path traversal (#old-8 → resolved by AIN-P0-03 authenticated upload
handler). Remaining — most need the **owner** (ops access or a decision):

1. **Atlas actual indexes** vs schema declarations — owner runs
   `pnpm --filter aintel-backend db:ensure-indexes -- --json` read-only, then a
   conscious guarded apply if needed.
2. **Accounting/fiscalization handoff** (D-016) — how invoices reach accounting;
   shapes the AIN-P1-08 schema.
3. **Backup/restore procedure** for Atlas + `/var/www/aintel/uploads` — existence
   unknown; highest-severity ops unknown.
4. **nginx `dev.inteligent.si/aintel-api` proxy config** — affects AIN-P0-01
   IP-allowlist option.
5. **Secondary prod-log signatures** (32× max-call-stack, FinanceSnapshot/BSON) —
    triage after AIN-P1-02.

## Next steps

Implementation, not audit. Order: `IMPLEMENTATION_SEQUENCE.md` (Wave 0 = P0 security
items). Keep this file + the DOCUMENTATION_MAINTENANCE matrix current as code changes.
