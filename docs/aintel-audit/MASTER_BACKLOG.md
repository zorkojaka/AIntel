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

### AIN-P0-02 — Fix finance authorization (server-side leak) + settings write gates
> **Corrected (spec pass + final review) — this is NOT a one-line role gate.**
> Full design: `specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-02 (authoritative).
- **Problem**: finance endpoints return **all** employees' earnings to any
  authenticated user (server-side; the frontend role filter is cosmetic); the payment
  PATCH is ungated; settings has **three** ungated write mounts (settings,
  pdf-settings, communication settings).
- **Evidence**: `backend/routes.ts:36-39` (no gates);
  `finance-analytics.controller.ts` (no scoping/role checks); FinancePage.tsx
  `isExecutionOnly` self-view (369-372) — a blanket gate breaks installer self-service.
- **Scope**: split finance router into company (ADMIN+FINANCE) vs self sub-router with
  **server-side** employee scoping (`/finance/my/earnings`); gate payment PATCH
  [ADMIN, FINANCE]; gate the three settings write mounts [ADMIN]; phased rollout so
  installers keep their earnings view (backend → SPA switch → final `/snapshots` gate).
- **Acceptance**: per spec (EXECUTION curl: company endpoints 403, own earnings only;
  settings writes 403 for non-ADMIN; FINANCE/ADMIN unchanged). Effort **M** (was
  mis-scoped as S). Owner decision D-012 (SALES read access — default strict).

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

### AIN-P1-07 — clientId on Project (WebInquiry already has it)
> **Scope corrected (final review)**: `WebInquiry.clientId` already exists and is set
> by the intake engine (`web-inquiry.model.ts:96`, `web-inquiry.service.ts:673`).
> Only **Project** lacks the FK (`projects/schemas/project.ts` — embedded
> `customer.name` only).
- Add `clientId: ObjectId` (nullable) to Project + backfill script matching
  customer.name → CrmClient (report ambiguities, don't guess); new projects always set
  it (project creation + web-inquiry engine already touch CrmClient); equipment
  endpoint (`public.routes.ts:210`, joins by `'customer.name'`) switches to clientId
  with name fallback.
- Acceptance: new projects linked; backfill report reviewed by owner before run
  (dry-run mode mandatory). Effort M. Deps: P1-01 preferred first.

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

## Done

### AIN-P0-03 — Authenticate `/uploads`
- **Landed**: AIN-P0-03 implementation commit.
- **Summary**: Replaced anonymous `/uploads` static serving with `GET /uploads/*`
  behind `requireAuth`, preserving existing upload URLs for authenticated SPA image
  loads. Added path-traversal/null-byte protection and backend tests.
- **Acceptance**: unauthenticated `/uploads/...` returns 401; traversal resolver
  rejects escape attempts; source grep found no embedded `/uploads` email/template
  `<img>` references in checked communication paths.
