# Master Backlog

Prioritized P0–P3. Effort: S <1d, M days, L 1–2wk, XL multi-week. Each item is
self-contained for handoff to a coding agent. Always read AGENT_HANDOFF.md first;
never run DB-writing scripts (shared prod DB) until AIN-P1-01 is done.

---

## P0 — Security / active exposure

### AIN-P0-01 — Split public API surface; rotate web-inquiry API key
- **Problem**: One shared X-API-Key gates all `/api/public/*`; it is published in
  website HTML (inteligent-si/videonadzor.html:12); `GET /api/public/clients/equipment`
  returns any customer's installed security equipment by email.
- **Evidence**: `backend/modules/web-inquiries/public.routes.ts` (requireApiKey,
  equipment route); SECURITY_AND_PRIVACY.md S1.
- **Value**: Closes public exposure of customer PII/physical-security data.
- **Scope**: New env var for a second server-only key; move `/clients/equipment`
  (and any future server-to-server route) behind it; keep widget endpoints on the
  browser key; rotate both keys (coordinate website + portal env updates); add IP
  allowlist option for the server key.
- **Acceptance**: equipment endpoint rejects the browser key; widget flows unchanged
  (manual test via staging widget); old key invalid.
- **Deps**: coordinated deploy of AIntel + portal env + website HTML. Effort M. Risk:
  brief widget downtime if keys mismatched — sequence: add new keys, switch consumers,
  revoke old.
- **Files**: public.routes.ts, core/app.ts (optional split mount), portal server.js
  (env only), inteligent-si pillar pages (inline config), docs: SECURITY, INTEGRATION_MAP.

### AIN-P0-02 — Role-gate finance and settings
- **Problem**: `/api/finance/*` (employee earnings + payment PATCH) and
  `PUT /api/settings` open to every authenticated user.
- **Evidence**: `backend/routes.ts:39-40` (no gates); finance/routes/index.ts;
  settings.routes.ts; USER_ROLES §Findings 1–2.
- **Scope**: `requireRoles([ADMIN, FINANCE])` on finance mount (decide: read summaries
  maybe +SALES — ask owner, default strict); `requireRoles([ADMIN])` on settings PUT
  (GET stays open — frontend shows company data broadly). Sweep remaining mounts and
  document intended access per mount in USER_ROLES doc.
- **Acceptance**: EXECUTION user gets 403 on /api/finance and settings PUT; existing
  FINANCE/ADMIN flows work. Effort S. Risk: hidden UI dependencies (e.g. dashboards
  fetching finance as non-finance user) — grep frontend fetches first.

### AIN-P0-03 — Authenticate `/uploads`
- **Problem**: All uploaded photos/files publicly served without auth.
- **Evidence**: `core/app.ts` express.static; S2.
- **Scope**: Replace static mount with an authenticated streaming route (reuse files
  module); exception list for genuinely public assets (e.g. review-related images if
  any); keep public web-inquiry photo upload but not public read.
- **Acceptance**: unauthenticated GET /uploads/... → 401; UI images still render
  (same-origin cookie). Check emails that embed upload URLs (attachment-resolver) —
  switch to attachments where needed. Effort M. Risk: broken email images — audit
  templates first.

### AIN-P0-04 — Explain 58k PM2 restarts on production
- **Problem**: `pm2 describe aintel` shows 58,165 restarts; cause unknown.
- **Scope** (read-only investigation): pm2 logs history, deploy workflow frequency,
  memory limits, crash signatures; write findings to AUDIT_PROGRESS + fix ticket if
  crash-loop found.
- **Acceptance**: documented root cause + follow-up item. Effort S.

---

## P1 — Stability, foundations, first wheel automation

### AIN-P1-01 — Separate staging database + email trap
- **Problem**: staging shares prod DB `inteligent`; staging tests send real emails.
- **Scope**: new `MONGO_DB` for staging + documented data-copy procedure (owner runs);
  staging SMTP override to a trap/prefix mode; README warnings updated.
- **Acceptance**: staging writes never touch prod db; staging emails clearly marked.
- Effort M (mostly ops coordination). **Blocks all test-writing items.**

### AIN-P1-02 — Error tracking (Sentry or self-hosted GlitchTip)
- Wire into errorHandler + unhandledRejection + frontend. Needs owner approval for
  new dependency + SaaS choice. Acceptance: TD-B7-style errors visible with stack +
  request context. Effort S–M.

### AIN-P1-03 — Structured logging with request IDs
- pino + middleware (request id, user id, tenant, route, latency); replace ad-hoc
  console.\* incrementally (start: core, communication sends, public intake).
- Acceptance: one JSON line per request in prod logs. Effort M.

### AIN-P1-04 — Smoke tests for the five money flows
- Inquiry→offer (mock SMTP), offer confirm→WO+MO, preparation advance, execution→
  signature, invoice issue→snapshot. Vitest + mongodb-memory-server (no shared DB).
- Acceptance: `pnpm test` green locally/CI without touching Atlas. Effort L.
  Deps: AIN-P1-01 not strictly required (memory server), but P1-02 helps.

### AIN-P1-05 — Index audit + ensure-indexes script
- Compare schema-declared indexes vs Atlas actuals (owner runs read-only listIndexes);
  add explicit `scripts/ensure-indexes.ts` run consciously at deploy; add missing
  hot-path indexes (projects.status, communicationmessages.projectId, workorders
  projectId+offerVersionId…). Effort M. Evidence: db/mongo.ts autoIndex:false.

### AIN-P1-06 — Fix installer-prep ObjectId cast bug
- **Evidence**: pm2 error log — `'undefined'` string cast at WorkOrder query in
  `sendInstallerPreparationEmail` (communication.service.ts ~:854 dist).
- Scope: guard workOrderId presence/validity in controller + service; return 400.
- Acceptance: repro request returns clean error; no BSONError in logs. Effort S.

### AIN-P1-07 — clientId on Project + WebInquiry
- Add `clientId: ObjectId` (nullable) + backfill script matching customer.name →
  CrmClient (report ambiguities, don't guess); new projects always set it (project
  creation + web-inquiry engine already touch CrmClient); equipment endpoint switches
  to clientId with name fallback.
- Acceptance: new projects linked; backfill report reviewed by owner before run
  (dry-run mode mandatory). Effort M. Deps: P1-01 preferred first.

### AIN-P1-08 — Promote invoiceVersions to a collection
- Schema from current shapes (inspect existing docs via dry-run analysis script with
  owner); dual-read (collection first, embedded fallback), write new only to
  collection; migrate old with script. Effort L. Risk: highest-value data — do after
  P1-04 smoke tests exist.

### AIN-P1-09 — Task entity + inbox (the wheel's hub)
- New `tasks` module (platform-core style): schema per TARGET_OPERATING_MODEL
  §mechanism, CRUD + my-tasks/role-tasks endpoints, core-shell inbox page + badge.
  Manual tasks first; no automation yet. Effort L.

### AIN-P1-10 — Scheduler worker
- In-process interval runner (node-cron acceptable — ask owner re dependency) with
  job registry, per-job lock (mongo lock doc), run log. Effort M. Deps: P1-03 logging.

### AIN-P1-11 — First automation rules
- offer sent+3d → follow-up task; validUntil passed → expired + task; signature saved
  → FINANCE invoice task (2d due); web inquiry nextStep → matching task; inquiry
  new>1 business day uncontacted → escalation task.
- Acceptance: each rule covered by a unit test; tasks visible in inbox. Effort M.
  Deps: P1-09, P1-10.

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
- **AIN-P2-09** Kill header tenant/actor trust (S3): server-side only; remove
  buildTenantHeaders from frontend. Effort S–M (verify no legit use).
- **AIN-P2-10** tenantId backfill on business collections + compound indexes +
  query-layer plugin. Effort L. Deps: P2-09, P1-05.
- **AIN-P2-11** Config store (namespaced, tenant-scoped, zod-validated) absorbing
  scattered settings. Effort L.

## P3 — Product & polish

- **AIN-P3-01** Login rate limiting + optional 2FA. Effort M.
- **AIN-P3-02** Shared frontend API client (fetch wrapper + error toasts + retry).
  Effort M.
- **AIN-P3-03** Repeat-sale rules on installed equipment age. Effort M. Deps: P2-08.
- **AIN-P3-04** Portal: offer acceptance + service tickets on shared client identity.
  Effort L. Deps: P1-07, P2-08.
- **AIN-P3-05** Vertical package extraction (pillars/classification/predlogi as
  config). Effort XL. Deps: P2-11.
- **AIN-P3-06** Enum value neutralization (SL→neutral codes + display mapping).
  Effort L. Deps: P3-05 planning.
- **AIN-P3-07** External pilot tenant. Deps: P2-10, P2-11, P3-05 partially.
- **AIN-P3-08** Docs debt: mark stale docs superseded (TD-X1/X2), route reference
  generation (TD-X3), archive dead files (D1–D3, D8, D10 after owner OK).

## Documentation updates per item
Every item lists its docs in-line; at minimum update MODULE_CATALOG review status,
relevant modules/*.md, and AUDIT_PROGRESS "last reviewed commit" when landed.
