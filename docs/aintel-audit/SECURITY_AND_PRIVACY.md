# Security and Privacy

Commit `c0afad8`. No secret values reproduced here. Severity: Critical/High/Medium/Low.
Confidence: Confirmed / High confidence / Probable / Needs verification.

## S1 — Public API key exposes customer equipment data — **Critical, RESOLVED in code (AIN-P0-01)**

- Previously, the `/api/public` router protected everything with one shared
  `X-API-Key` (`web-inquiries/public.routes.ts`, `requireApiKey`).
- That key is embedded in public website HTML (`inteligent-si/videonadzor.html:12`,
  `window.AINTEL.apiKey`) — anyone viewing page source has it.
- The same browser-key group exposed `GET /clients/equipment?email=…`, which returns
  the customer's projects and installed equipment for any email address.
- **Consequence was: any internet user could enumerate customer emails and retrieve what
  security equipment (cameras, alarms) is installed at which customer.** For a security
  company this is also a physical-security issue.
- AIN-P0-01 split `/api/public/clients/*` onto an internal sub-router guarded only by
  `AINTEL_INTERNAL_API_KEY` and non-browser CORS. Widget/review endpoints remain on
  `AINTEL_WEB_INQUIRY_API_KEY`. Tests verify that the browser key gets 401 for
  `/clients/equipment`, the internal key gets 200, and `/options` still accepts the
  browser key.
- Rollout requirement: owner must set `AINTEL_INTERNAL_API_KEY` in AIntel/portal env
  and rotate the browser key on the website/widget. The agent did not edit env files or
  deploy-time secrets.
- Note: rate limiting is in-memory, per-process, keyed by spoofable `x-forwarded-for`
  (Confirmed) — no real brute-force protection for email enumeration.

## S2 — Unauthenticated static `/uploads` — **High, RESOLVED (AIN-P0-03)**

- Previously `core/app.ts` served `/uploads` via anonymous `express.static`, exposing
  project/execution photos (customers' homes, installed security equipment),
  web-inquiry photos, and documents to anyone with a URL.
- AIN-P0-03 replaced the static mount with `GET /uploads/*` behind `requireAuth`
  (`backend/core/app.ts`, `backend/modules/files/upload-stream.ts`). Existing stored
  `/uploads/...` URLs remain valid for authenticated same-origin SPA image loads.
- The handler resolves every requested path below `/var/www/aintel/uploads` and rejects
  `..`, absolute escapes, Windows-style traversal, and null bytes before file access.
- Residual risk: phase 1 allows any authenticated user to read upload URLs they know;
  per-entity ownership checks remain a later hardening item.

## S3 — `x-tenant-id` / `x-user-id` header trust — **High, RESOLVED (AIN-P2-09)**

- Previously, `utils/tenant.ts` preferred client-supplied headers over the authenticated
  session for both tenant and actor resolution. Any logged-in user could attribute
  actions to another user or (future) another tenant wherever these helpers were used.
- AIN-P2-09 changed `resolveTenantId` and `resolveActorId` to ignore
  `x-tenant-id`/`x-user-id` and use server-side session context/user fallbacks. The
  frontend no longer imports or sends `buildTenantHeaders`, and the helper export was
  removed from `shared/utils/tenant.ts`.
- Residual multi-tenant work remains in AIN-P2-10: backfill tenant IDs on business
  collections and add compound indexes/query scoping.

## S4 — Role-gate gaps on sensitive modules — **High, RESOLVED (AIN-P0-02)**

- Previously `/api/finance/*` (incl. employee earnings detail and payment PATCH) and
  settings writes had no role restrictions.
- AIN-P0-02 gates company finance endpoints and payment PATCH to ADMIN/FINANCE, adds a
  server-scoped `/api/finance/my/earnings` endpoint for installers, switches the
  execution-only finance UI to that endpoint, and gates settings/pdf-settings/
  communication settings writes to ADMIN.
- Residual risk: other authenticated modules remain intentionally broad for the small
  company model; see `USER_ROLES_AND_PERMISSIONS.md` findings 3–5.

## S5 — Shared prod/staging database — **High (operational), Confirmed by environment**

- Staging code (including experimental branches) runs against production data with
  production credentials. A staging bug can corrupt production records; test actions
  send real emails. Remediation is organizational: separate `MONGO_DB` for staging +
  data-sync procedure; gate email sending in staging.

## S6 — PII handling / GDPR — **Medium, High confidence**

- Customer PII (names, addresses, phones, emails, site photos, signatures as base64)
  spread across projects, work orders (embedded copies), confirmation versions,
  web inquiries, communication messages, uploads on disk.
- No retention policy, no delete/anonymize path (CrmClient delete is soft/isActive;
  projects keep embedded customer copies), no data-processing register in repo.
- Signatures stored as data-URLs inside work orders (Confirmed schema) — sensitive,
  included in any project fetch.
- Remediation: PII inventory (this doc + DATA_MODEL is a start), retention/erasure
  procedure, restrict signature/photo access.

## S7 — Auth/session details — **Low–Medium**

- Good: bcrypt cost 12; reset/invite tokens random 32B, stored as SHA-256 hashes;
  cookie httpOnly + secure(prod) + sameSite=lax; JWT secret mandatory in prod;
  status re-checked per request.
- Gaps: no login rate limiting / lockout (Confirmed — auth controller has none);
  no 2FA; 7-day JWT with no revocation; `sameSite=lax` mitigates CSRF for POST but
  state-changing GETs would be exposed (none observed — Probable OK).

## S8 — Injection / input surface — **Medium, Probable**

- Mongoose with `express.json` — classic NoSQL-injection via object payloads is
  partially mitigated by explicit field handling, but hand-rolled validation and
  `Mixed` fields (`invoiceVersions`, `executionDefinitions`) accept arbitrary
  structures; no sanitization layer (no zod, no mongo-sanitize).
- File uploads filter by MIME (client-declared) only; no content sniffing; filenames
  sanitized. Uploaded files are now read behind authentication, but an authenticated
  user could still retrieve a known upload URL until per-entity checks exist.
- Template rendering (`template-render.service.ts`) interpolates `{{…}}` into email
  HTML — check escaping of customer-controlled values (Needs verification).

## S9 — Secrets hygiene — **Medium, RESOLVED by read-only scan (2026-07-07)**

- `.env` files not inspected (per rules). Bootstrap admin password comes from env and
  is only used when the users collection is empty (Confirmed) — fine.
- The web-inquiry API key already leaked into public HTML (S1) → treat as compromised
  and rotate regardless of other fixes.
- Read-only repo scan performed without printing secret values. `gitleaks`/`trufflehog`
  were not installed, so the scan used high-signal regexes for common cloud tokens,
  private keys, OpenAI/GitHub/Slack tokens, and credentialed MongoDB URIs.
- Current tracked tree: no high-signal matches.
- Git history: only `backend/.env.example` matched the credentialed Mongo URI pattern;
  redacted review showed an example placeholder file, not a currently tracked secret.
- Limitation: this is not a certified full secret scan. Run gitleaks/trufflehog in CI or
  on a maintainer machine before external sharing; still rotate the already-public
  browser key per AIN-P0-01.

## S10 — Availability / DoS — **Low–Medium**

- Public inquiry endpoint does heavy work (DB writes, offer generation, email) behind
  weak rate limiting → spam can create projects/clients en masse and burn SMTP
  reputation. Duplicate window (10 min per email+pillar) helps only for identical
  senders. Remediation: captcha/turnstile on widget, server-side quotas, queue.
- 58k PM2 restarts: **explained** — historical boot crash-loop, already fixed in
  source (`specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-04). Residual availability risk:
  no PM2 backoff guardrails against a future boot misconfig.

## Unresolved checks (follow-ups)

1. Nginx config for `dev.inteligent.si/aintel-api` proxy (headers, TLS, IP forwarding).
2. Atlas network allowlist / user privileges (least privilege?).
3. Email template escaping (S8).
4. Backup/restore procedure for Atlas and `/var/www/aintel/uploads`.
