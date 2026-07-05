# Security and Privacy

Commit `c0afad8`. No secret values reproduced here. Severity: Critical/High/Medium/Low.
Confidence: Confirmed / High confidence / Probable / Needs verification.

## S1 — Public API key exposes customer equipment data — **Critical, Confirmed**

- The `/api/public` router protects everything with one shared `X-API-Key`
  (`web-inquiries/public.routes.ts`, `requireApiKey`).
- That key is embedded in public website HTML (`inteligent-si/videonadzor.html:12`,
  `window.AINTEL.apiKey`) — anyone viewing page source has it.
- The same router exposes `GET /clients/equipment?email=…` which returns the customer's
  projects and installed equipment for any email address.
- **Consequence: any internet user can enumerate customer emails and retrieve what
  security equipment (cameras, alarms) is installed at which customer.** For a security
  company this is also a physical-security issue.
- Remediation (P0): split the public router into (a) widget endpoints that keep the
  browser key, and (b) server-to-server endpoints (equipment) behind a **separate,
  never-published key** (or move portal integration to an authenticated internal API);
  rotate the current key; consider per-consumer keys + IP allowlist for the portal.
- Note: rate limiting is in-memory, per-process, keyed by spoofable `x-forwarded-for`
  (Confirmed) — no real brute-force protection for email enumeration.

## S2 — Unauthenticated static `/uploads` — **High, Confirmed**

- `core/app.ts`: `app.use('/uploads', express.static('/var/www/aintel/uploads'))` with
  no auth. Contains project/execution photos (customers' homes, installed security
  equipment), web-inquiry photos, documents.
- URLs are semi-guessable (`/uploads/web-inquiries/<mongoId>/foto-<timestamp>-<rand>`),
  and are shared in emails/UI, so they leak.
- Remediation: authenticated file endpoint (files module already exists) or signed
  URLs; at minimum disable directory-style enumeration and move behind auth for
  entity types with PII.

## S3 — `x-tenant-id` / `x-user-id` header trust — **High now (audit-trail spoofing), Critical for multi-tenant, Confirmed**

- `utils/tenant.ts` prefers client-supplied headers over the authenticated session for
  both tenant and actor resolution. Any logged-in user can attribute actions to another
  user or (future) another tenant wherever these helpers are used
  (logistics controller uses tenant for employee resolution; actor helpers feed audit
  attribution).
- Update (Confirmed): the pattern is deliberate — the frontend sends `x-tenant-id`
  from build-time `VITE_TENANT_ID` via `shared/utils/tenant.ts` `buildTenantHeaders`,
  used in ExecutionPanel, LogisticsPanel, OffersTab. The client asserts its own tenant.
- Remediation: derive tenant/actor exclusively from `req.context` (session); remove
  `buildTenantHeaders` usage frontend-side in the same change.

## S4 — Role-gate gaps on sensitive modules — **High, Confirmed**

- `/api/finance/*` (incl. employee earnings detail and payment PATCH) and
  `/api/settings` PUT have no role restrictions — any ACTIVE user, including
  EXECUTION installers, can access. Details in `USER_ROLES_AND_PERMISSIONS.md`.
- Remediation: mount-level `requireRoles([ADMIN, FINANCE])` for finance,
  `[ADMIN]` (or ADMIN+FINANCE) for settings PUT; sweep all mounts for default-open.

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
  sanitized. Static serving means an uploaded polyglot is served back as-is
  (images only allowed — residual risk Low/Medium).
- Template rendering (`template-render.service.ts`) interpolates `{{…}}` into email
  HTML — check escaping of customer-controlled values (Needs verification).

## S9 — Secrets hygiene — **Medium, Needs verification**

- `.env` files not inspected (per rules). Bootstrap admin password comes from env and
  is only used when the users collection is empty (Confirmed) — fine.
- The web-inquiry API key already leaked into public HTML (S1) → treat as compromised
  and rotate regardless of other fixes.
- Recommend: secret rotation runbook; ensure repo history contains no secrets
  (not scanned in this audit — follow-up: `git log -p` scan or trufflehog run).

## S10 — Availability / DoS — **Low–Medium**

- Public inquiry endpoint does heavy work (DB writes, offer generation, email) behind
  weak rate limiting → spam can create projects/clients en masse and burn SMTP
  reputation. Duplicate window (10 min per email+pillar) helps only for identical
  senders. Remediation: captcha/turnstile on widget, server-side quotas, queue.
- 58k PM2 restarts unexplained (see AUDIT_PROGRESS) — availability risk until
  understood.

## Unresolved checks (follow-ups)

1. Nginx config for `dev.inteligent.si/aintel-api` proxy (headers, TLS, IP forwarding).
2. Atlas network allowlist / user privileges (least privilege?).
3. Email template escaping (S8).
4. Repo secret scan (S9).
5. Backup/restore procedure for Atlas and `/var/www/aintel/uploads`.
