# Master Backlog

Prioritized P0–P3. Effort: S <1d, M days, L 1–2wk, XL multi-week. Each item is
self-contained for handoff to a coding agent. Always read AGENT_HANDOFF.md first;
never run DB-writing scripts (shared prod DB) until AIN-P1-01 is done.

> **Authority note (final review 2026-07-05):** for P0 items,
> `specs/P0_IMPLEMENTATION_SPECS.md` is authoritative over the summaries below.
> Execution order and wave checkpoints: `IMPLEMENTATION_SEQUENCE.md`. Wheel items
> (P1-09/10/11/12): design per `AINTEL_WHEEL_SPEC.md`.

---

## P0 — Security / active exposure

### AIN-P0-04 — PM2 restart guardrails (root cause RESOLVED)
> **Corrected (spec pass): no longer an open investigation.** Root cause confirmed:
> a **historical boot crash-loop** — an older build hard-required
> `AINTEL_ALLOWED_ORIGINS` while prod `.env` lacked it; current source falls back to
> defaults (`core/app.ts:13-35`, no throw). Loop stopped; the 58,165 counter is
> cumulative. Full evidence: `specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-04.
- **Remaining scope** (owner-owned, no app code): verify prod dist has no
  `required in production` throw; set `AINTEL_ALLOWED_ORIGINS` in prod env explicitly;
  `pm2 reset aintel`; add `max_restarts`/`min_uptime`/`restart_delay` to PM2 config.
- **Follow-ups spun out**: triage `32× Maximum call stack size exceeded` +
  FinanceSnapshot/BSON signatures once error tracking (AIN-P1-02) lands.
- **Acceptance**: per spec. Effort S.

---

## P1 — Stability, foundations, first wheel automation

### AIN-P1-01 — Separate staging database + email trap
- **Problem**: staging shares prod DB `inteligent`; staging tests send real emails.
- **Scope**: new `MONGO_DB` for staging + documented data-copy procedure (owner runs);
  staging SMTP override to a trap/prefix mode; README warnings updated.
- **Acceptance**: staging writes never touch prod db; staging emails clearly marked.
- **Agent support landed**: shared email trap support and owner runbook
  `runbooks/AIN-P1-01_STAGING_DB_EMAIL_TRAP.md`; owner env/ops verification still
  required before marking done.
- Effort M (mostly ops coordination). **Blocks all test-writing items.**

### AIN-P1-02 — Error tracking (Sentry or self-hosted GlitchTip)
- Wire into errorHandler + unhandledRejection + frontend. Needs owner approval for
  new dependency + SaaS choice. Acceptance: TD-B7-style errors visible with stack +
  request context. Effort S–M.

### AIN-P1-03 — Structured logging with request IDs
- pino + middleware (request id, user id, tenant, route, latency); replace ad-hoc
  console.\* incrementally (start: core, communication sends, public intake).
- Acceptance: one JSON line per request in prod logs. Effort M.

### AIN-P1-08 — Promote invoiceVersions to a collection
- Schema from current shapes (inspect existing docs via dry-run analysis script with
  owner); dual-read (collection first, embedded fallback), write new only to
  collection; migrate old with script. Effort L. Risk: highest-value data — do after
  P1-04 smoke tests exist.

### AIN-P1-09 — Task entity + inbox (the wheel's hub)
- New `tasks` module (platform-core style): schema + API + inbox per
  **`AINTEL_WHEEL_SPEC.md` §2** (authoritative design; senior schema review first).
  Manual tasks first; no automation yet. Effort L.

### AIN-P1-10 — Scheduler worker
- In-process interval runner (node-cron acceptable — ask owner re dependency) with
  job registry, per-job lock (mongo lock doc), run log. Effort M. Deps: P1-03 logging.

### AIN-P1-11 — First automation rules
- Rule set + idempotency (dedupeKey) + config kill-switches per
  **`AINTEL_WHEEL_SPEC.md` §3/§9**: offer sent+3d → follow-up task; validUntil passed
  → expired + task; signature saved → FINANCE invoice task (2d due); web inquiry
  nextStep → matching task; inquiry new>1 business day uncontacted → escalation task.
- Acceptance: each rule covered by a unit test; tasks visible in inbox; every rule
  individually disableable via config (ships disabled). Effort M. Deps: P1-09, P1-10.

### AIN-P1-12 — Invoice payment tracking
- dueDate + paidAt + status on (new) invoice collection; mark-paid endpoint
  (ADMIN/FINANCE); overdue rule → task + reminder email template. Effort M.
  Deps: P1-08, P1-11.

---

## P2 — Structure, coupling, tenancy prep

- **AIN-P2-01** Freeze legacy embedded offers/POs/deliveries: log usage counters on
  legacy endpoints (D4/D5), then remove writes, then archive code. Effort M.
- **AIN-P2-02** State-machine layer for project/offer/material transitions (wrap,
  don't migrate). Effort L. Deps: P1-04.
- **AIN-P2-03** Extract logistics.controller services (confirmation/work-order/
  material) with characterization tests. Effort L–XL. Deps: P1-04.
- **AIN-P2-04** Unify four communication send functions into one pipeline; single
  place for template context + attachment resolution. Effort M–L.
- **AIN-P2-05** Supplier normalization: supplier entity or config list; expectedAt on
  material orders; late-delivery rule. Effort M.
- **AIN-P2-06** Split ExecutionPanel/OffersTab/LogisticsPanel along domains/ with
  extracted hooks; no behavior change. Effort L–XL (per panel M–L).
- **AIN-P2-07** Generic audit log middleware for mutating routes (who/route/entity/
  diff summary). Effort M.
- **AIN-P2-08** Service module: tickets + maintenance plans + portal intake
  (TARGET §8). Effort XL.
- **AIN-P2-10** tenantId backfill on business collections + compound indexes +
  query-layer plugin. Effort L. Deps: P2-09, P1-05.
- **AIN-P2-11** Config store (namespaced, tenant-scoped, zod-validated) absorbing
  scattered settings. Effort L.

## P3 — Product & polish

- **AIN-P3-02 DONE** Shared frontend API client (fetch wrapper + error toasts + retry).
  Effort M.
  - Shared `parseApiEnvelope`/`fetchApi` helper in
    `shared/utils/api-client.ts`; core-shell auth, module-settings,
    module-projects, module-employees, module-profil, module-finance,
    module-crm, module-dashboard, and module-cenik API helpers now consume it;
    module-employees form/service-rate helper, module-settings secondary
    sections, selected module-projects hooks, project load, timeline/project
    workspace fetches, ProjectsPage CRUD/list operations, logistics/execution
    standard fetches, OffersTab offer/template/assignment transport, and
    price-list autocomplete also use it. Shared `fetchApi` supports opt-in retry
    and a standardized error-reporting hook. Remaining grep hits are intentional
    special cases: custom category `options`, logistics email non-JSON fallback,
    and cenik 409 duplicate-precheck conflict data.
- **AIN-P3-03** Repeat-sale rules on installed equipment age. Effort M. Deps: P2-08.
- **AIN-P3-04** Portal: offer acceptance + service tickets on shared client identity.
  Effort L. Deps: P1-07, P2-08.
- **AIN-P3-05** Vertical package extraction (pillars/classification/predlogi as
  config). Effort XL. Deps: P2-11.
- **AIN-P3-06** Enum value neutralization (SL→neutral codes + display mapping).
  Effort L. Deps: P3-05 planning.
- **AIN-P3-07** External pilot tenant. Deps: P2-10, P2-11, P3-05 partially.
- **AIN-P3-08** Docs debt: TD-X1/X2 stale-doc banners and TD-X3 route reference are
  done. Remaining scope: archive dead files (D1–D3, D8, D10) after owner OK.

## Documentation updates per item
Every item lists its docs in-line; at minimum update MODULE_CATALOG review status,
relevant modules/*.md, and AUDIT_PROGRESS "last reviewed commit" when landed.

## Done

### AIN-P0-01 — Split public API surface; rotate web-inquiry API key
- **Landed**: AIN-P0-01 implementation commit.
- **Summary**: `/api/public/clients/*` now mounts before the browser-key public router,
  uses non-browser CORS, and requires `AINTEL_INTERNAL_API_KEY`. Browser-facing
  options/products/inquiries/reviews remain on `AINTEL_WEB_INQUIRY_API_KEY`.
- **Acceptance**: backend tests verify `/clients/equipment` rejects the browser key
  with 401, accepts the internal key with 200 and correct equipment data, and keeps the
  widget `/options` route working with the browser key while rejecting the internal key.
- **Owner rollout**: agent did not edit `.env`, portal env, website HTML, or secret
  values. Owner must set `AINTEL_INTERNAL_API_KEY` in AIntel/portal and rotate the
  published browser key on the website/widget before production rollout.

### AIN-P0-03 — Authenticate `/uploads`
- **Landed**: AIN-P0-03 implementation commit.
- **Summary**: Replaced anonymous `/uploads` static serving with `GET /uploads/*`
  behind `requireAuth`, preserving existing upload URLs for authenticated SPA image
  loads. Added path-traversal/null-byte protection and backend tests.
- **Acceptance**: unauthenticated `/uploads/...` returns 401; traversal resolver
  rejects escape attempts; source grep found no embedded `/uploads` email/template
  `<img>` references in checked communication paths.

### AIN-P1-06 — Fix installer-prep ObjectId cast bug
- **Landed**: AIN-P1-06 implementation commit.
- **Summary**: Added shared workOrderId normalization for installer-prep email and
  guard checks in both controller and service before any WorkOrder lookup.
- **Acceptance**: a repro request with `workOrderId=undefined` returns a clean 400
  error (`Delovni nalog ni pravilno določen.`), and service-level invalid input fails
  before Mongo query code can trigger a BSON/ObjectId cast error.

### AIN-P1-04 — Smoke tests for the five money flows
- **Landed**: AIN-P1-04 implementation commit.
- **Summary**: Added a backend `node:test` smoke scenario using
  `mongodb-memory-server` for inquiry→offer, offer confirmation→work order/material
  order, preparation advance, execution signature, and invoice issue→finance
  snapshot.
- **Acceptance**: `pnpm test` is green locally without touching Atlas; the test uses an
  in-memory MongoDB and keeps inquiry auto-email disabled rather than sending SMTP.

### AIN-P0-02 — Fix finance authorization (server-side leak) + settings write gates
- **Landed**: AIN-P0-02 implementation commit.
- **Summary**: Split finance into company routes gated to ADMIN/FINANCE and a scoped
  `/finance/my/earnings` endpoint for installers. Switched the finance frontend
  execution-only view to the scoped endpoint, gated payment PATCH to ADMIN/FINANCE, and
  gated settings/pdf-settings/communication settings writes to ADMIN.
- **Acceptance**: EXECUTION gets 403 on company finance endpoints, payment PATCH, and
  non-ADMIN settings writes; `/finance/my/earnings` returns only the caller's
  employee earnings; FINANCE company finance and payment PATCH remain available.

### AIN-P1-05 — Index audit + ensure-indexes script
- **Landed**: AIN-P1-05 implementation commit.
- **Summary**: Added hot-path schema indexes for project status/assignment and
  workorder/material-order project+offer lookups, plus
  `backend/scripts/ensure-indexes.ts` and `pnpm --filter aintel-backend db:ensure-indexes`.
- **Acceptance**: script defaults to read-only dry-run/listIndexes planning; apply mode
  requires `--apply --i-understand-this-writes-indexes` and additionally
  `--allow-shared-db` for db `inteligent`. Agent did not run against Atlas or create
  indexes; owner must run the dry-run/apply consciously during deploy.

### AIN-P1-07 — clientId on Project (WebInquiry already has it)
- **Landed**: AIN-P1-07 implementation commit.
- **Summary**: Added nullable `Project.clientId`, linked manual and web-inquiry
  project creation to `CrmClient`, switched the portal equipment lookup to `clientId`
  with a legacy `customer.name` fallback, and added a read-only
  `project-clientid-backfill-report` script.
- **Acceptance**: new projects are linked to active CRM clients; the equipment endpoint
  prefers `clientId` and still supports legacy rows by name; the backfill report is
  dry-run/report-only and must be reviewed by the owner before any future DB-writing
  backfill. Agent did not run the report against Atlas/shared `inteligent`.

### AIN-P2-09 — Kill header tenant/actor trust (S3)
- **Landed**: AIN-P2-09 implementation commit.
- **Summary**: `resolveTenantId` and `resolveActorId` now ignore spoofable
  `x-tenant-id`/`x-user-id` headers and derive identity from server-side session
  context/user fallbacks. Frontend project panels no longer import or send
  `buildTenantHeaders`; the helper export was removed.
- **Acceptance**: backend tests verify spoofed tenant/actor headers do not override
  session context and unauthenticated single-tenant fallback still returns
  `inteligent` for tenant and `null` for actor.

### AIN-P3-01 — Login rate limiting
- **Landed**: AIN-P3-01 implementation commit.
- **Summary**: Added an in-memory/per-process failed-login limiter keyed by tenant,
  normalized email, and request IP. Successful login resets the counter; blocked
  attempts return 429 with `Retry-After`.
- **Acceptance**: unit tests verify threshold blocking, reset/window expiry, and env
  tuning. Optional 2FA remains future scope and was not implemented.
