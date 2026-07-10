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

### AIN-P1-08 — Promote invoiceVersions to a collection
- Schema from current shapes (inspect existing docs via dry-run analysis script with
  owner); dual-read (collection first, embedded fallback), write new only to
  collection; migrate old with script. Effort L. Risk: highest-value data — do after
  P1-04 smoke tests exist.

### AIN-P1-09 — Task entity + inbox (the wheel's hub)
- New `tasks` module (platform-core style): schema + API + inbox per
  **`AINTEL_WHEEL_SPEC.md` §2** (authoritative design; senior schema review first).
  Manual tasks first; no automation yet. Effort L.
- **Backend landed (2026-07-09, AIN-P1-09)**: `modules/tasks` (schema per §2 incl.
  indexes + ensure-indexes registration, dedupeKey unique-sparse; lifecycle
  open/in_progress/blocked/done/cancelled with claim/complete/block/unblock/
  cancel/reopen/reassign/reschedule actions, resolution required on done,
  blockedReason required on blocked, task-local history). API `/api/tasks`:
  GET /my (personal + role-pool union, overdue counts), GET / (ADMIN, aging),
  GET /by-subject/:kind/:id, POST /, PATCH /:id. 11 tests on
  mongodb-memory-server (46 backend tests green).
- **Inbox UI landed (2026-07-09, AIN-P1-09)**: new `apps/module-tasks`
  (OpravilaPage: Moja opravila / Bazen mojih vlog / Danes zaključeno; claim,
  complete-with-outcome, block-with-reason, unblock, cancel; create form with
  assign-to-me or role pool; overdue rows red), registered in core-shell with
  route /opravila and an open-count nav badge (60 s refresh). By-subject task
  strips now render on project detail and expanded web-inquiry rows. Deployed to
  staging. **Remaining scope: owner visual review.**

### AIN-P1-10 — Scheduler worker
- **Landed (2026-07-09, AIN-P1-10)**: `node-cron`-based in-process scheduler
  foundation with job registry, Mongo lease locks (`scheduler_locks`), observable run
  log (`scheduler_runs`), Sentry/log forwarding on failures, and a first
  `tasks.sla_sweep` job that marks overdue open/in-progress tasks with
  `slaBreachedAt` while skipping blocked tasks. The worker is env-gated by
  `AINTEL_SCHEDULER_ENABLED=true` so staging/prod shared DB writes cannot start
  accidentally before owner ops verification. Tests use `mongodb-memory-server`.
  Remaining scope: owner enables env after staging DB safety review; automation rules
  remain AIN-P1-11.

### AIN-P1-11 — First automation rules
- Rule set + idempotency (dedupeKey) + config kill-switches per
  **`AINTEL_WHEEL_SPEC.md` §3/§9**: offer sent+3d → follow-up task; validUntil passed
  → expired + task; signature saved → FINANCE invoice task (2d due); web inquiry
  nextStep → matching task; inquiry new>1 business day uncontacted → escalation task.
- Acceptance: each rule covered by a unit test; tasks visible in inbox; every rule
  individually disableable via config (ships disabled). Effort M. Deps: P1-09, P1-10.
- **Landed (2026-07-09, AIN-P1-11), ALL RULES SHIP DISABLED**: scheduler/rules.ts —
  event rules inquiry.first_contact (auto-offer → review task next business day;
  else call task +4 working hours; hooks in public.routes POST /inquiries) and
  inquiry.next_step (posvet/ogled/avans → immediate SALES task + auto-resolves the
  first-contact task); scan rules inquiry.stale_escalation (hourly, >N business
  days uncontacted → ADMIN urgent), offer.follow_up (sent+N days silent → task to
  offer creator/SALES pool; accepted/rejected offers auto-complete their open task),
  offer.expiry (validUntil passed → renew-or-close task; offer status NOT mutated in
  v1). Kill switches + params in wheel_settings via scheduler/wheel-config.ts
  (dots in rule keys encoded __ for Mongo paths), ADMIN API GET/PUT
  /api/tasks/wheel-config. Task.resolution gains optional resolvedByRule. 7 unit
  tests over memory Mongo (60 backend tests green). Signature→invoice rule deferred
  to AIN-P1-12 (needs invoice collection).

### AIN-P1-14 — Inbound email ingestion (dedicated mailbox → project trail)
- Dedicated mailbox read via IMAP scheduler job; raw messages stored in
  `email_messages`; matching by In-Reply-To/References (store messageId on send),
  sender→CRM client→open projects, PON-/PRJ- numbers; matched → project timeline
  entry + communication thread (sent+received together); unmatched → `email.unmatched`
  task to SALES pool. Wheel follow-up: customer reply auto-completes the open
  offer.follow_up task. Read-only mailbox handling, never auto-replies, credentials
  in .env only. New deps `imapflow` + `mailparser` (owner approval). Phased F0–F4 in
  `EMAIL_FOLLOWUP_AND_INGESTION_PLAN.md`; F0 = owner creates the address + IMAP creds.
  Effort L. Deps: P1-10 (done); F2 touches communication send path (messageId).
- **Landed (2026-07-10) — F0–F4 + resolve center**: owner confirmed prodaja@ as the
  dedicated mailbox (same creds as SMTP → AINTEL_IMAP_* in both .env files).
  `modules/email`: email_messages + email_ingest_state (lastUid/uidValidity, mailbox
  opened READ-ONLY, own sent mail skipped), scheduler job `email.ingest` every 5 min
  gated by new wheel rule `email.ingest` (ships OFF; visible in Nastavitve →
  Opravila). Matching F2 uses providerMessageId (already stored on send) →
  document number (PONUDBA-/PRJ-) → CRM client email + newest active project.
  F3: project timeline entry; F4: open offer.follow_up auto-completes on customer
  reply + `email.reply`/`email.unmatched` task to SALES. New module **Pošta**
  (`apps/module-mail`, route /posta): inbox with filters (povezano/čaka povezavo/
  prezrto), search, message detail, manual link-to-project, ignore, manual ingest
  run; API /api/email (ADMIN+SALES). Tests: `email-ingest.test.ts` (84 backend
  tests green). Remaining: F5 AI layer (povzetek/klasifikacija/predlog odgovora —
  needs Anthropic API key) + F6 smart forwarding to servis@/racuni@; owner enables
  rule `email.ingest` in settings to start reading.

### AIN-P1-15 — Offer rescue campaign: discount code after a week of silence
- Owner idea (2026-07-09): offer sent +X days, customer has MARKETING CONSENT and
  offer above a threshold → campaign task with email PREVIEW carrying a single-use
  discount code (percent, min order value, expiry, NOT stackable with quantity
  discounts). Manual batch send like P1-13; true auto-mode is a separate per-rule
  switch enabled only after owner trust. Needs a small coupons module in AIntel
  (create/validate/redeem at offer confirmation, redemption ledger) and measurement
  (redeemed codes ↔ offers → funnel card). GDPR: consented recipients only, unsubscribe
  in every mail. Spec: `EMAIL_FOLLOWUP_AND_INGESTION_PLAN.md` §AIN-P1-15. Effort M–L.
  Deps: P1-13, ECO-09/10 (consents), coupons module.

### AIN-P1-16 — Smart form defaults: most-common choices preselected
- Owner direction (2026-07-09): "optimizacija da prihranimo pri času in da so
  stvari enostavne" — in the offer/inquiry creation flows the most common choices
  are PRESELECTED so the user can move fast, with a subtle hint showing what is
  usually chosen ("najpogosteje izbrano"). Source of truth = our own statistics
  (salesStats/offer history, same engine as ECO-35), not hardcoded guesses;
  recompute with the stats cron. Applies to: new-project/offer forms in AIntel
  and the web configurator (web side tracked as ECO-36). Effort M. Deps: ECO-35.
- **Landed (2026-07-10) — offer builder (Zahteva) + server suggestions**:
  salesStats now flows into module-projects (CenikProduct type) with utils
  salesQty/salesCompare/topSellerId (soldQty365 first, soldQty fallback). All
  product tracks rank sales before price within equal adequacy: SekcijaSnemalnik
  (alternatives + recommendedId), SekcijaPoESwitch, SekcijaDisk, SekcijaKameraNosilec
  (cameras within brand + brackets), SekcijaAlarmOprema sortProducts (hub choice
  untouched — owner-set Hub/Hub2 logic). Top seller per visible track gets an amber
  »★ najpogosteje izbrano« badge (`.zahteva-sales-hint`). Backend predlagajSnemalnik/
  PoESwitch/Disk/Nosilce sort `'salesStats.soldQty365': -1` before price within the
  right size bucket. Tests: `backend/test/zahteve-predlogi-sales.test.ts` (4).
  Remaining scope: owner visual review; web configurator side = ECO-36.

### AIN-P1-12 — Invoice payment tracking
- dueDate + paidAt + status on (new) invoice collection; mark-paid endpoint
  (ADMIN/FINANCE); overdue rule → task + reminder email template. Effort M.
  Deps: P1-08, P1-11.

---

## P2 — Structure, coupling, tenancy prep

- **AIN-P2-02** State-machine layer for project/offer/material transitions (wrap,
  don't migrate). Effort L. Deps: P1-04.
- **AIN-P2-03** Extract logistics.controller services (confirmation/work-order/
  material) with characterization tests. Effort L–XL. Deps: P1-04.
- **AIN-P2-06** Split ExecutionPanel/OffersTab/LogisticsPanel along domains/ with
  extracted hooks; no behavior change. Effort L–XL (per panel M–L).
  - Progress (2026-07-10): `ExecutionPanel`/`LogisticsPanel` already live under
    domains; first OffersTab slice moved offer editor/import/KM/PDF helper types and
    pure functions into `domains/offers/offerEditorUtils.ts`. Second slice moved the
    pure offer item recalculation, trailing blank row handling, and totals calculation
    into the same helper. Third slice moved the offer PDF action button group and PDF
    preview/download state handlers into `domains/offers/OfferPdfActionGroup.tsx` and
    `domains/offers/useOfferPdfActions.ts`. Fourth slice moved the pasted-offer import
    modal into `domains/offers/OfferImportDialog.tsx` while keeping parse/apply state
    in OffersTab. Fifth slice moved the create/rename/delete template dialogs into
    `domains/offers/OfferTemplateDialogs.tsx`. AIN-P2-06 remains open until the large
    OffersTab UI/state sections are split further.
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

### AIN-P2-04 — Unify communication send pipeline
- **Landed**: the four outbound project communication sends (offer, invoice,
  work-order confirmation, installer preparation) now share one internal
  `sendAndRecordCommunicationEmail` pipeline for SMTP delivery, inline company logo
  attachment handling, communication message persistence, provider message id capture,
  and sent/failed communication events.
- **Scoped intentionally**: domain-specific data gathering, template contexts, and
  attachment request selection remain inside each send function because invoices,
  offers, signed confirmations, and installer preparation have different validation
  and fallback text. Installer preparation keeps its `previewOnly` path and its
  existing "email sent but logging failed" response behavior.
- **Acceptance used**: derived from the backlog text because no separate acceptance
  block existed: all four send functions use a single delivery/record/event pipeline,
  template HTML escaping remains covered by S8 tests, and attachment resolution still
  flows through `attachment-resolver.service.ts`.
- **Tests**: communication template escaping, email trap, installer preparation
  guard, and follow-up email task tests; full backend test suite remains required for
  final verification.

### AIN-P2-01 — Freeze legacy embedded offers/POs/deliveries
- **Landed**: legacy embedded project write functions now fail closed with HTTP 410
  and emit a structured `legacy.project_embedded_write` warning event. The still
  registered legacy delivery receive route (`POST /api/projects/:id/deliveries/:deliveryId/receive`)
  is blocked before any Project lookup or embedded-array mutation. Unregistered
  legacy embedded offer actions in `project.controller.ts` (`sendOffer`,
  `confirmOffer`, `cancelConfirmation`, `selectOffer`) are also guarded the same way
  if they are ever re-mounted accidentally.
- **Current source of truth**: `OfferVersion`, `MaterialOrder`, and `WorkOrder`
  collection-backed APIs remain active; frontend grep confirms module-projects uses
  those paths for offer save/send/confirm, material PDFs, and work-order execution.
- **Acceptance used**: derived from the backlog text because no separate acceptance
  block existed: legacy embedded write attempts are observable through logs, embedded
  writes are removed/fail closed, and old code is left archived in-place rather than
  deleted.
- **Tests**: `backend/test/legacy-embedded-freeze.test.ts` verifies the registered
  delivery receive endpoint returns 410 before DB access and logs the legacy counter
  event.

### AIN-P1-20 — Follow-up agreed at send time + three-state rule modes
- **Owner direction (2026-07-10)**: creating a follow-up task manually after sending
  an offer is wasted work. The send-offer dialog now has a checkbox "Če ne bo
  odgovora, me spomni čez [N] dni" (N prefilled from wheel params, editable) — the
  task is created immediately with the due date N days out, same dedupeKey as the
  scan rule so nothing duplicates, and it still auto-resolves when the offer status
  changes. Wheel rules got a third state: **off / manual / auto** (stored as `mode`
  next to `enabled` for back-compat). For offer.follow_up: manual = checkbox
  unchecked by default (user confirms per send), auto = checkbox prechecked AND the
  silence scan creates tasks as a safety net; off = hidden + no scan. For task-only
  rules manual==auto (documented in the settings UI). New non-admin endpoint
  GET /api/tasks/follow-up-defaults for dialog prefill. Settings UI: three-button
  segmented control per rule.
- **Tests**: wheel-rules.test.ts +2 subtests (manual scan suppression; send-time
  scheduling + dedupe + auto-resolve; off → no-op). 79 backend tests green.

### AIN-P2-05 — Supplier normalization + expectedAt + late-delivery rule
- **Landed**: AIN-P2-05 implementation commit.
- **Summary**: Material order items now carry a normalized `supplierKey` derived from
  supplier name/address while keeping the original Slovenian supplier display fields.
  Material orders now support top-level `expectedAt`; preparation UI can set the date
  and the existing work-order update path persists it. A new disabled-by-default wheel
  rule `material.late_delivery` scans overdue, not-yet-ready material orders and
  creates an ORGANIZER task with a deterministic dedupe key. Nastavitve → Opravila
  exposes the new rule toggle and `materialLateGraceDays` parameter.
- **Acceptance used**: derived from the task text because no separate acceptance block
  existed: normalize supplier identity without adding a migration or new collection,
  persist `expectedAt` on material orders, add a late-delivery rule, keep the rule
  disabled until owner/admin enablement, and cover the rule with memory Mongo tests.
- **Tests**: `backend/test/wheel-rules.test.ts` covers disabled behavior,
  late-delivery task creation, readiness/future-date skip, and idempotency;
  `backend/test/ensure-indexes.test.ts` covers the declared `expectedAt` index.

### AIN-P2-07 — Generic audit log middleware for mutating routes
- **Landed**: AIN-P2-07 implementation commit.
- **Summary**: Added a protected `/api` mutation audit middleware that emits one
  structured log event after every POST/PUT/PATCH/DELETE request. The event records
  tenant, actor user/employee, roles, method, route, status, request id, a best-effort
  module/entity id, and a sensitive-key-filtered summary of changed top-level request
  fields. Public intake and auth routes are intentionally outside this middleware;
  public intake keeps its own request logging and protected app routes carry the auth
  context needed for "who" fields.
- **Acceptance used**: derived from the backlog text because no separate acceptance
  block existed: mutating protected routes produce structured audit events with
  who/route/entity/diff-summary data, sensitive values are not logged, and DELETE
  requests do not log body field changes.
- **Tests**: `backend/test/audit-log.test.ts` covers event shape, entity extraction,
  sensitive field filtering, and DELETE field omission.

### AIN-P1-19 — Configurator result: "kaj dobite" value payload (not just a price)
- **Landed**: AIN-P1-19 implementation commit.
- **Summary**: Browser `POST /api/public/inquiries` responses now extend
  `offerSummary` with a customer-facing `value` payload when an automatic offer is
  created (and for duplicate responses when the saved offer is available). The payload
  is built from actual offer items plus cenik product descriptions/images: grouped
  equipment, included services (with a safe montage/configuration fallback), coverage
  text derived from the submitted configurator answers, and reassurance points. It
  intentionally does not expose `defaultsApplied` or other internal automation notes.
- **Acceptance used**: derived from the task text because no separate acceptance block
  existed: keep existing price fields, add value payload from real offer/cenik data,
  include equipment/services/coverage/reassurance, and keep internal defaults private.
- **Tests**: existing money-flow smoke now asserts the value payload, descriptions,
  image URL, coverage, reassurance, and no `defaultsApplied` leakage on
  `mongodb-memory-server`.

### AIN-P1-17 — Motivational progress bar in multi-step flows
- **Landed**: AIN-P1-17 implementation commit.
- **Summary**: Added a visible motivational progress bar to the internal
  `module-projects` project workspace flow. It derives progress from the existing
  timeline steps (`Zahteve → Ponudbe → Priprava → Izvedba → Račun`), starts above
  0 % via an endowed-progress baseline, shows completed/total step count, highlights
  the active step, and switches to a near-finish message (`Še zadnji korak`) when the
  workflow reaches the final step. The change is presentational only and does not
  mutate project status, offer, logistics, execution, or invoice business logic.
- **Acceptance used**: derived from the task text because no separate acceptance block
  existed: progress is obvious in the internal multi-step flow, never starts at 0 %,
  clearly signals near-completion, and keeps the public configurator/web-side work
  scoped to ECO-36 outside this repository.

### AIN-P1-18 — Task templates + Nastavitve → Opravila section
- **Landed 2026-07-09**: owner request — company configures its task processes in
  settings; adding a task becomes one click on a template instead of typing.
- **Summary**: new `task_templates` collection (name/title/description/priority/
  dueInDays/assigneeRole/isActive/order, tenant-scoped) with defaults seeded on
  first read (pokliči stranko, ogled, pripravi ponudbo, follow-up, naroči material,
  termin montaže, servisni obisk). API: GET `/api/tasks/templates` (all users,
  `?all=1` includes inactive), POST/PATCH/DELETE ADMIN-only. New settings section
  **Opravila** (between Prodaja and Sistem) with template CRUD + the wheel automation
  rules UI (per-rule toggles with SI descriptions + params offerFollowUpDays etc.,
  via existing GET/PUT `/api/tasks/wheel-config`). OpravilaPage: template chips above
  the new-task form; a click prefills title/description/priority/due/assignee, all
  fields stay editable.
- **Tests**: `backend/test/task-templates.test.ts` (default seeding idempotent,
  validation, activeOnly filter, delete, tenant isolation) on memory Mongo.

### AIN-P1-13 — Follow-up email from the follow-up task (one click, always manual)
- **Landed**: AIN-P1-13 implementation commit.
- **Summary**: `offer.follow_up` tasks now expose a manual "Pripravi e-mail" action
  in Opravila plus a batch follow-up section with checkboxes. The backend validates
  that the task is an active offer follow-up, renders active template key
  `offer_follow_up` with offer/customer context when present (fallback body otherwise),
  previews recipient/subject/body/PDF attachment, sends only after explicit user
  confirmation through the existing offer communication pipeline, and completes the
  task with outcome `follow-up mail poslan` only after a successful send. Each batch
  send is still a separate backend send and communication log entry. No automatic
  e-mail sending was added.
- **Acceptance used**: derived from the task text because no separate acceptance block
  existed: preview renders the follow-up template with offer context; non-follow-up
  tasks are rejected; failed sends leave the task open; Opravila supports single and
  selected batch manual sends.
- **Tests**: `backend/test/task-follow-up-email.test.ts` covers preview context,
  invalid task rejection, and failed-send/no-complete behavior on
  `mongodb-memory-server`.

### AIN-P1-02 — Error tracking (Sentry, EU data residency)
- **Landed**: AIN-P1-02 implementation commit (owner chose Sentry EU 2026-07-08;
  GlitchTip/self-host deferred to avoid ops burden).
- **Summary**: Added `@sentry/node` behind `backend/core/sentry.ts` and an
  `backend/instrument.ts` loaded first in `server.ts`. Sentry is **optional** — if
  `SENTRY_DSN` is unset the app runs normally with no error tracking. `errorHandler`
  forwards 500s via `captureRequestException` with minimal, scrubbed context:
  request id (`x-request-id`), route, HTTP method, status code, environment, release,
  and a minimal user (internal id + primary role only — no name/email). `sendDefaultPii`
  is off and a `beforeSend` scrubber strips cookies, request body, query strings, and
  auth/cookie/API-key headers as defence in depth. EU data residency is carried by the
  DSN (EU-region project → `*.ingest.de.sentry.io`).
- **Acceptance**: verified disabled-by-default no-op (no DSN), enabled path with an EU
  DSN, and the scrubber removing secrets/PII via `test/sentry-scrub.test.ts`
  (32 backend tests green); `npm run build` clean.
- **Owner setup** (no secrets in repo): create an **EU-region** Sentry project and set
  in AIntel backend env — `SENTRY_DSN` (EU DSN), optional `SENTRY_ENVIRONMENT`
  (defaults to `NODE_ENV`), `SENTRY_RELEASE` (deploy commit sha), and
  `SENTRY_TRACES_SAMPLE_RATE` (defaults `0`, errors only). Never commit the DSN.
- **Follow-up**: frontend SPA capture (`@sentry/react`) not yet wired — backend-only
  for now; add per-app init in a later item if desired.

### AIN-P1-03 — Structured logging with request IDs
- **Landed**: AIN-P1-03 implementation commit (owner approved the `pino` dependency
  2026-07-08).
- **Summary**: Added a shared `pino` logger (`backend/core/logger.ts`) and a
  `pino-http` middleware (`backend/core/middleware/httpLogger.ts`) mounted first in
  `createApp`, so every request — including `/api/public` intake — emits one JSON line
  with a request id (echoed on the `x-request-id` response header), method/url, the
  tenant/user/route from `req.context`, status, and latency. `errorHandler` now logs
  500s with the full stack via `req.log`. Migrated the named ad-hoc `console.*` in core
  (server bootstrap), communication sends (email transport, project-communication
  controller, installer-prep logging), and public intake (web-inquiry routes + service)
  to structured logging. Prod/test emit JSON; local dev gets `pino-pretty` only on a
  TTY; tests run silent.
- **Acceptance**: verified one JSON line per request with reqId/tenant/user/route/
  latency and 200→info / 500→error+stack via a standalone smoke; `npm run build` and all
  29 backend tests green.
- **Follow-up**: `console.*` migration was scoped to the named start areas; remaining
  ad-hoc `console.*` elsewhere can move to `req.log`/`logger` incrementally.

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
