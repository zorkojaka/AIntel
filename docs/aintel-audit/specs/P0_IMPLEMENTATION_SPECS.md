# P0 Implementation Specifications

Produced 2026-07-05 against commit `72d301d` (audit docs) / source at `c0afad8`.
Status: **specifications only — no application code changed.** Code snippets below are
proposals for the implementer, not applied edits.

Each spec was re-verified against the code during this pass. **Two findings changed
materially from the backlog summary** — read the "Evidence & correction" boxes:

- **AIN-P0-02** is *not* a one-line role gate. The finance endpoints leak all
  employees' payroll to any authenticated user via **server-side** logic; the frontend
  role filter is cosmetic. A blanket gate would also break installers' legitimate
  self-service earnings view. Settings has **three** ungated sub-mounts, not one.
- **AIN-P0-04** is *not* an open question. Root cause is confirmed: a historical boot
  crash-loop (`AINTEL_ALLOWED_ORIGINS is required in production`) that is **already
  fixed in current source**. The action is verification + guardrails, not a bug fix.

Cross-cutting constraint: production and staging share Mongo db `inteligent`. None of
these changes require DB writes. Do all testing against a local/memory DB or read-only.

---

## AIN-P0-01 — Split the public API surface; move the equipment endpoint off the browser key

### Evidence (verified)
- Public router mounted pre-auth, pre-global-CORS: `backend/core/app.ts:42`
  `app.use('/api/public', express.json(), webInquiryPublicRoutes)`.
- Single guard for the whole router: `backend/modules/web-inquiries/public.routes.ts:84-85`
  `router.use(cors({ origin: true, … }))` then `router.use(requireApiKey)`; key =
  `process.env.AINTEL_WEB_INQUIRY_API_KEY` (`public.routes.ts:69`).
- Routes on that router (`public.routes.ts`):
  - **Browser-facing (legitimately public):** `GET /options` (87), `GET /products` (97),
    `POST /inquiries` (109), `POST /inquiries/:id/photos` (162),
    `POST /inquiries/:id/next-step` (276), `GET /reviews` (238),
    `GET /reviews/by-token/:token` (246), `POST /reviews/by-token/:token` (252).
  - **Server-to-server (must NOT be on the browser key):** `GET /clients/equipment`
    (197) — returns a customer's projects + installed equipment by email.
- Consumers of the browser key (all embed it in page source):
  `inteligent-si/{index,domov,izdelki,videonadzor,ocena}.html` + `pages/*.html`
  (`window.AINTEL.apiKey`) and `apps/web-widget/videonadzor-widget.js`.
- Consumer of the equipment endpoint: **portal only**, server-to-server —
  `inteligent-portal/server.js:171-172`
  `fetch(${AINTEL_API_BASE}/clients/equipment?…, { headers: { 'X-API-Key': AINTEL_API_KEY } })`.
- Deploy workflows exist: `.github/workflows/deploy.yml`, `deploy-staging.yml` (for
  coordinating the AIntel side of a key rotation).

### Root problem
One shared secret gates both public browser traffic and a PII/physical-security data
endpoint, and that secret is published in website HTML. The browser key **cannot** be
kept secret; therefore the equipment endpoint is effectively public.

### Design
1. **Introduce a second key** `AINTEL_INTERNAL_API_KEY` (server-to-server only, never
   shipped to any browser).
2. **Split the router into two guard groups** in `public.routes.ts`:
   - Keep `requireApiKey` (browser key) on options/products/inquiries*/reviews*.
   - Add `requireInternalApiKey` (new) on `/clients/equipment` and any future s2s route.
   - Give the internal group a **stricter CORS** (`origin: false` — s2s needs no CORS)
     instead of the shared `origin: true`.
3. **Optional hardening** on the internal group: IP allowlist via
   `AINTEL_INTERNAL_API_ALLOWED_IPS` (portal/localhost), checked against the real
   client IP (note the existing `clientIp()` trusts `x-forwarded-for` — for an allowlist
   use `req.socket.remoteAddress` behind a trusted proxy, or `trust proxy` set
   explicitly; document the proxy assumption).
4. **Rotate both keys** (the browser key is already compromised). Treat as two separate
   rotations with different blast radius.

Proposed guard (spec, not applied):
```ts
function requireInternalApiKey(req: Request, res: Response, next: NextFunction) {
  const configured = process.env.AINTEL_INTERNAL_API_KEY?.trim();
  if (!configured) return res.status(503).json({ ok: false, code: 'NOT_CONFIGURED' });
  const provided = (req.headers['x-api-key'] as string | undefined)?.trim();
  if (!provided || provided !== configured) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
  }
  return next();
}
```
Restructure so `/clients/equipment` is registered under a sub-router that uses
`cors({ origin: false })` + `requireInternalApiKey`, while the existing browser routes
keep their current CORS + `requireApiKey`.

### Files to change
- `backend/modules/web-inquiries/public.routes.ts` — split guards, move equipment route.
- `.env` (prod + staging) — add `AINTEL_INTERNAL_API_KEY` (owner; do not edit via agent).
- `inteligent-portal` `.env` — set `AINTEL_API_KEY` to the new internal key (owner).
- Website HTML + widget config — rotate browser key value (owner; many files).
- Docs: `SECURITY_AND_PRIVACY.md` S1 → `RESOLVED`, `INTEGRATION_MAP.md`, `DECISIONS.md`
  D-008 supersede.

### Rollout (ordered, zero-downtime)
1. Deploy backend that accepts **both** the new internal key (equipment) and, temporarily,
   still accepts the old key on equipment (dual-accept) — OR schedule a short window.
   Recommended: dual-accept internal-or-legacy on equipment for one deploy.
2. Set `AINTEL_INTERNAL_API_KEY` in AIntel env; set portal `AINTEL_API_KEY` to it; verify
   portal "Moja oprema" works.
3. Remove legacy-key acceptance on equipment (second deploy).
4. Separately rotate the browser key: set new `AINTEL_WEB_INQUIRY_API_KEY`, update all
   website pages + widget, deploy website; verify widget + reviews.

### Acceptance criteria
- `GET /api/public/clients/equipment` with the **browser** key → 401.
- Same with the **internal** key (from portal) → 200 and correct data.
- Widget flow (`/options`,`/products`,`/inquiries`) and website reviews still work with
  the (rotated) browser key.
- Old (pre-rotation) values of both keys are rejected.

### Test plan (no prod DB writes)
- Local: start backend with both env keys set; curl equipment with each key; curl a
  browser route with each key. `POST /inquiries` against a local/memory DB only.
- Staging (after AIN-P1-01 DB split ideally): manual widget + portal smoke.

### Rollback
Revert `public.routes.ts`; keep env keys (harmless). Portal falls back if its key still
matches whatever the backend accepts — that's why dual-accept in step 1 matters.

### Risk & effort
Effort **M**. Risk: brief portal-equipment or widget breakage if key updates are
mis-sequenced → mitigated by dual-accept window and doing the two rotations separately.

---

## AIN-P0-02 — Fix finance authorization (server-side leak + missing gates) and settings write gates

> **Evidence & correction — the backlog "one-line gate" is wrong.**
> The finance frontend already restricts the *nav* to `FINANCE`
> (`apps/core-shell/src/App.tsx:62` `finance: ['FINANCE']`; ADMIN bypasses) and hides
> company data behind `canSeeCompany = ADMIN||FINANCE`
> (`apps/module-finance/src/FinancePage.tsx:373,384`). **But:**
> 1. EXECUTION-only installers legitimately open FinancePage to see **their own**
>    earnings (`isExecutionOnly`, `FinancePage.tsx:369-372`, self rows filtered at
>    `:591`). So a blanket `requireRoles([ADMIN,FINANCE])` on `/finance` **breaks
>    installer self-service**.
> 2. The self-view leak is **server-side**: `snapshotsList`, `employeesSummary`,
>    `employeeProjectEarningDetail` do **no** employee/role scoping
>    (`finance-analytics.controller.ts:42-114`) — they return **all** employees'
>    earnings; the frontend `row.employeeId === employeeId` filter is cosmetic. Any
>    authenticated user (curl) gets full payroll.
> 3. `updateEmployeeProjectEarningPayment` (PATCH, `:64`) has **no role check** — any
>    authenticated user can mark any employee's earning paid/unpaid.

### Evidence (verified)
- Mounts, all ungated except by `requireAuth`: `backend/routes.ts:36-39`
  `/settings` (settings.routes), `/settings` (pdfSettingsRoutes), `/settings/communication`,
  `/finance`.
- Finance routes: `backend/modules/finance/routes/index.ts` — no `requireRoles` anywhere;
  includes company analytics (`/invoices`, `/yearly-summary`, `/monthly-summary`,
  `/pipeline`, `/product-*`, `/basket-analysis`, `/employees-summary`) and
  self/earning (`/snapshots`, `/employees/:id/snapshots/:sid/earnings`,
  PATCH `/employees/:id/snapshots/:sid/payment`).
- Settings PUT unrestricted: `settings.routes.ts:7`; pdf-settings PUT `company` +
  `pdf-documents` (`pdf-settings.routes.ts:12,14`); communication settings PUT
  (`communication/routes/settings.routes.ts`).

### Design
Two separate concerns:

**(A) Company-wide finance data → ADMIN + FINANCE.**
Add `requireRoles([ROLE_ADMIN, ROLE_FINANCE])` to the company endpoints. Simplest:
split the finance router into a company sub-router (gated) and a self sub-router.
Company endpoints: `/`, `/addFromInvoice`, `/yearly-summary`, `/monthly-summary`,
`/invoices`, `/pipeline`, `/product-frequency`, `/basket-analysis`,
`/analytics/*`, `/employees-summary`, `/project/:id`, `/client/:id`, `/snapshots`
(company list), `/snapshots/:projectId`.

**(B) Employee self-service → any authenticated employee, but scoped server-side.**
For the installer self-view, do **not** rely on the frontend. Add server-side scoping:
- New behavior on the self endpoints: if the caller is **not** ADMIN/FINANCE, force
  `employeeId = req.context.actorEmployeeId` and ignore any other employeeId in the
  path/query; return only that employee's snapshots/earnings.
- `employeeProjectEarningDetail`: reject if `params.employeeId !== actorEmployeeId`
  for non-ADMIN/FINANCE (403).
- `snapshotsList` used by installers (`fetchAllSnapshots`) must filter earnings to the
  caller for non-privileged roles (either a new `mine=true`/scoped endpoint, or scope
  inside `listFinanceSnapshots`). Recommended: add `GET /finance/my/earnings` returning
  only the caller's rows, and switch the frontend execution path to it; keep `/snapshots`
  gated to ADMIN/FINANCE. (Frontend change is a follow-up, tracked here; backend ships
  the scoped endpoint first, then the SPA switches, then `/snapshots` is gated.)

**(C) Payment PATCH → ADMIN + FINANCE only.**
`updateEmployeeProjectEarningPayment` must be gated `[ADMIN, FINANCE]` (installers must
not toggle their own payment status).

**(D) Settings writes.**
- `PUT /settings` → `requireRoles([ROLE_ADMIN])`.
- `PUT /settings/company`, `PUT /settings/pdf-documents` → `requireRoles([ROLE_ADMIN])`.
- `PUT /settings/communication` (+ template create/update/delete) → `[ADMIN]`
  (or `[ADMIN, FINANCE]` — owner decides, see D-012). GET stays open (auth only) so
  other modules keep reading company data.

Proposed mount changes (spec):
```ts
// routes.ts
router.use('/settings', settingsRoutes);            // GET open; PUT gated inside module
router.use('/settings', pdfSettingsRoutes);         // PUTs gated inside module
router.use('/settings/communication', requireRoles([ROLE_ADMIN]), communicationSettingsRoutes);
router.use('/finance', financeRoutes);              // company vs self split inside module
```
Gate the write verbs inside each router (so GETs remain open) rather than at the mount,
e.g. in `settings.routes.ts`: `router.put('/', requireRoles([ROLE_ADMIN]), updateSettingsController)`.

### Sequencing (avoid breaking installers)
1. Ship backend: gate company endpoints + payment PATCH; add scoped self endpoint
   (`/finance/my/earnings`); settings write gates. Keep `/snapshots` temporarily
   accessible to EXECUTION **but scoped server-side** (or keep cosmetic filter one more
   release) to avoid a blank installer view.
2. Switch FinancePage execution path to the scoped endpoint (follow-up frontend PR).
3. Gate `/snapshots` to ADMIN/FINANCE once the SPA no longer calls it as an installer.

### Files
- `backend/modules/finance/routes/index.ts` (split + gates).
- `backend/modules/finance/controllers/finance-analytics.controller.ts` (scoping in
  snapshots/earnings/detail; role check helper via `req.context.roles` +
  `actorEmployeeId`).
- `backend/modules/settings/routes/settings.routes.ts`,
  `backend/modules/projects/routes/pdf-settings.routes.ts`,
  `backend/modules/communication/routes/settings.routes.ts` (write gates).
- `backend/routes.ts` (communication settings mount gate).
- Follow-up: `apps/module-finance/src/FinancePage.tsx` (switch execution path).
- Docs: `USER_ROLES_AND_PERMISSIONS.md` findings 1–2 → RESOLVED, `SECURITY_AND_PRIVACY.md`
  S4, `DECISIONS.md` D-012.

### Acceptance criteria
- As EXECUTION-only user (curl with their cookie): `GET /api/finance/invoices` → 403;
  `GET /api/finance/employees-summary` (company) → 403; `GET /api/finance/my/earnings`
  → 200 with **only their own** rows; `PATCH …/payment` → 403.
- As FINANCE/ADMIN: all endpoints 200 as before.
- Any non-ADMIN `PUT /api/settings`, `/settings/company`, `/settings/pdf-documents`,
  `/settings/communication` → 403; GET still 200.
- Existing FINANCE/ADMIN dashboards unaffected (manual FinancePage smoke).

### Test plan
- Unit/integration (vitest + memory DB): seed two employees with snapshots; assert an
  EXECUTION token sees only its own; assert 403s above; assert ADMIN/FINANCE see all.
- No shared-DB writes.

### Rollback
Revert the route/controller changes; behavior returns to open (documented regression).
Low blast radius — additive guards.

### Risk & effort
Effort **M** (was mis-scoped as S). Risk: over-restricting installer self-view →
mitigated by the scoped self endpoint + phased `/snapshots` gating. Grep confirmed the
only frontend finance caller is `module-finance`; no other module fetches `/api/finance`.

---

## AIN-P0-03 — Authenticate `/uploads`

### Evidence (verified)
- Unauthenticated static serving: `backend/core/app.ts` (uploads static mount, before
  `requireAuth`), root `/var/www/aintel/uploads`.
- URL scheme built server-side: `backend/utils/fileUpload.ts:73` (`buildFileUrl`
  → `/uploads/...`), `backend/modules/photos/routes.ts:235-236`
  (`/uploads/projects/<id>/<phase>/<file>`), web-inquiry photos
  `/uploads/web-inquiries/<inquiryId>/<file>` (`public.routes.ts`).
- **Email attachments do NOT read from `/uploads`** — they are generated in-memory:
  `communication/services/attachment-resolver.service.ts:5-9,65-91` call
  `generate*Pdf() → Buffer`. So authenticating `/uploads` will **not** break email.
- Frontend renders images via `photo.url` / `photo.thumbnailUrl`
  (`ExecutionPanel.tsx:172`, `PhotoManager.tsx:103`, `ExecutionDefinitionPanel.tsx:77`)
  — same-origin `<img src="/uploads/…">`, so cookie auth is sent automatically by the
  browser for a same-origin authenticated route.
- Dev proxies map `/uploads` (`apps/*/vite.config.ts`) — dev-only, unaffected.

### Design
Replace the anonymous `express.static('/var/www/aintel/uploads')` with an
**authenticated streaming route** mounted after `requireAuth`:

1. Add `GET /uploads/*` (or a dedicated `/api/files/raw/*`) behind `requireAuth` that:
   - Resolves the requested path against `UPLOAD_BASE_DIR` with **path-traversal
     protection**: `const abs = path.resolve(BASE, rel); if (!abs.startsWith(BASE + path.sep)) return 403;`
     (also reject `..`, null bytes). This closes the storage-group "Needs verification"
     traversal risk in the same change.
   - Streams the file with correct content-type; 404 if missing.
   - (Phase 1) any authenticated user may read (matches today's app-internal
     expectation). Per-entity ownership checks are a later item (not P0).
2. Keep the **public write** path for web-inquiry photo upload (that POST stays on the
   public router) but **remove public read** — inquiry photos are only viewed in the
   authenticated admin UI.
3. Because `<img>` requests are same-origin with the session cookie, the SPA needs no
   change. Verify the cookie is `SameSite=Lax` (it is — `auth.service.ts`
   `getSessionCookieOptions`) so same-origin image GETs carry it.

Proposed mount (spec):
```ts
// app.ts — replace express.static line
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, routes);
app.get('/uploads/*', requireAuth, streamUpload); // authenticated
// streamUpload: resolve+traversal-guard+stream from /var/www/aintel/uploads
```
Note ordering: `/uploads` must be registered **after** `cookieParser`/auth wiring and
must itself run `requireAuth`. Keep the path prefix `/uploads` so existing stored URLs
keep working.

### Files
- `backend/core/app.ts` (swap static for authed route; add `streamUpload` or reuse
  files module).
- Possibly `backend/modules/files/*` (a shared stream handler is the natural home).
- Docs: `SECURITY_AND_PRIVACY.md` S2 → RESOLVED, storage-group traversal note resolved.

### Acceptance criteria
- Unauthenticated `GET /uploads/projects/<id>/…` → 401.
- Authenticated SPA renders execution/requirement photos unchanged (manual: open a
  project with photos).
- `GET /uploads/../../etc/passwd` (encoded variants) → 403/400, never a file outside
  BASE.
- Emails with PDF attachments still send (unaffected — attachments are in-memory).

### Test plan
- Integration: authed vs unauthed GET on a temp file under a test BASE; traversal
  payloads. No prod paths.
- Manual staging: project photo view + one email send (mock SMTP) to confirm no
  regression.

### Rollback
Restore the `express.static` line. (Keep the traversal-safe handler for later.)

### Risk & effort
Effort **M**. Risk: any place that expects an anonymous image URL (e.g. a link pasted
into an email body as an `<img>` rather than an attachment) would break — grep found
none (email uses attachments), but check communication templates for embedded
`/uploads` `<img>` before shipping (Needs verification — quick grep of
`communicationtemplates` seed/UI).

---

## AIN-P0-04 — Production restart loop: confirmed root cause + guardrails

> **Correction — this is no longer an open investigation.** Root cause is confirmed and
> **already fixed in current source**; the remaining work is verification + guardrails,
> not a code bug.

### Evidence (verified, read-only)
- `pm2 describe aintel`: **58,165** restarts, **uptime 45h**, "unstable restarts 0",
  script `/home/jaka/apps/aintel/AIntel/backend/dist/backend/server.js`.
- Error-log signature counts (`~/.pm2/logs/aintel-error.log`):
  `58,055 × Error: AINTEL…`, `51 × listen EADDRINUSE`, `32 × Maximum call stack size
  exceeded`, small counts of Connection timeout / SMTP / FinanceSnapshot validation /
  BSONError.
- The dominant error, in full:
  `Error: AINTEL_ALLOWED_ORIGINS is required in production.` thrown at
  **`dist/backend/core/app.js:26` (`createCorsOptions`) → `createApp` → `server.js:16`**
  — i.e. it throws **at boot**, so PM2 restarts immediately → tight crash-loop → the
  51 EADDRINUSE are the loop racing itself on the port.
- **Current source does not throw this:** `backend/core/app.ts:13-24` `createCorsOptions`
  falls back to `DEFAULT_PRODUCTION_ORIGINS` and merely appends
  `AINTEL_ALLOWED_ORIGINS` if present — no hard requirement. So the crash-looping build
  was an **older compiled artifact** whose env lacked `AINTEL_ALLOWED_ORIGINS`.
- The loop has **stopped**: uptime 45h, error.log last modified Jul 2, out.log shows
  122 successful `posluša na …` starts, tail of logs is normal template output. The
  58k counter is **cumulative and never reset**.

### Conclusion
A historical boot crash-loop caused by a prior build that hard-required
`AINTEL_ALLOWED_ORIGINS` while the prod `.env` did not set it. Resolved already — either
by deploying the current source (which removed the requirement) and/or setting the var.
Not currently crashing. **The audit's instinct was right: restarting would have done
nothing; the fix was in code/env, not the process.**

### Design (verification + prevention — no app bug to fix)
1. **Confirm prod runs current source** (owner/read-only): the deployed
   `dist/backend/core/app.js` should match current `app.ts` (defaults, no throw).
   `grep -n "required in production" /home/jaka/apps/aintel/AIntel/backend/dist/backend/core/app.js`
   → expect **no match**. If it still matches, redeploy the current build.
2. **Set `AINTEL_ALLOWED_ORIGINS` in prod `.env`** anyway (owner) so intent is explicit,
   even though defaults now cover it.
3. **Reset the restart counter** so future anomalies are visible: `pm2 reset aintel`
   (owner action; not a code change).
4. **Add crash-loop guardrails** in the PM2 ecosystem/deploy config (owner-owned,
   normally out of agent scope — propose, don't edit): `max_restarts`, `min_uptime`,
   `restart_delay`/exponential backoff, so a boot-time misconfig can never spin to 58k
   again.
5. **Startup self-check + alert:** on boot, validate required env (JWT secret is already
   enforced in `auth.service.ts:29`; add non-fatal warnings for recommended vars) and,
   once error tracking exists (AIN-P1-02), report boot failures. Consider failing
   **loudly once** and backing off rather than tight-looping.
6. **Investigate the secondary signatures** as separate, low-priority items:
   `32 × Maximum call stack size exceeded` (possible recursion — capture a stack when
   error tracking lands) and the 2× FinanceSnapshot validation / BSONError (overlaps
   AIN-P1-06).

### Files / actions
- No application source change required for the primary cause.
- Proposed (owner-owned, out of strict agent scope): PM2 ecosystem file
  `max_restarts`/`min_uptime`/`restart_delay`; prod `.env` `AINTEL_ALLOWED_ORIGINS`.
- Optional app change: a small `assertBootConfig()` logging recommended-var warnings at
  startup (safe, additive).
- Docs: `AUDIT_PROGRESS.md` unresolved #1 → RESOLVED (this spec), `SYSTEM_CONTEXT.md`
  PM2 note updated, `TECHNICAL_DEBT.md` TD-R1 → RESOLVED (cause) + new TD for backoff
  guardrails, `SECURITY_AND_PRIVACY.md` S10 restart note.

### Acceptance criteria
- `grep "required in production" dist/backend/core/app.js` on prod → no match (or
  redeploy scheduled).
- `AINTEL_ALLOWED_ORIGINS` present in prod env; restart counter reset to 0.
- PM2 config has `max_restarts`/`min_uptime` so a boot misconfig backs off instead of
  looping.
- `Maximum call stack` and BSON/FinanceSnapshot signatures triaged into backlog items.

### Risk & effort
Effort **S** (verification + config). Risk: none to app behavior; the guardrail config
change is owner-owned and reversible.

---

## Summary of corrections made during this review

| Item | Backlog said | Verified reality |
|---|---|---|
| P0-01 | Split public key | Correct; refined the exact route split (only `/clients/equipment` is s2s) + phased dual-accept rotation |
| P0-02 | "One line: role-gate finance & settings" (effort S) | **Wrong.** Server-side payroll leak (frontend filter cosmetic); blanket gate breaks installer self-view; payment PATCH ungated; settings has 3 write mounts. Effort M with a phased plan |
| P0-03 | Authenticate uploads; risk of breaking email images | Correct; verified email uses **in-memory** attachments (no `/uploads` read) → email safe; fold in path-traversal guard |
| P0-04 | "Open: investigate 58k restarts" | **Resolved cause:** historical boot crash-loop (`AINTEL_ALLOWED_ORIGINS required`) already fixed in source; action is verify + reset counter + backoff guardrails |
