# System Context

Audit date 2026-07-05, commit `c0afad8`. No secret values in this document.

## The three applications

### 1. AIntel (primary system)

| Item | Production | Staging |
|---|---|---|
| Path | `/home/jaka/apps/aintel/AIntel` | `/home/jaka/apps/aintel-staging/AIntel` |
| Branch | `main` | feature branches |
| Domain | `aintel.inteligent.si` | `testaintel.inteligent.si` |
| PM2 process | `aintel` (fork) | `aintel-staging` (fork) |
| Port | 3000 | 3001 |
| Entry | `backend/dist/backend/server.js` (compiled) | same pattern |
| Database | Mongo Atlas, db **`inteligent`** | **same db `inteligent`** ⚠️ |

⚠️ **Production and staging share one database.** Any DB write from staging is a
production write. This is the single most important operational constraint
(Confirmed: audit brief + both `.env` locations untouched, PM2 cwd inspection).

Additional worktree: `/home/jaka/apps/aintel-staging/AIntel-web-intake`
(branch `codex/web-inquiries-intake`) — used for the web-intake feature and this audit.

- GitHub: `github.com/zorkojaka/AIntel` (SSH key `~/.ssh/github`).
- Deploys: GitHub workflow deploys staging over SSH (commit `7870d02` mentions keepalive
  + concurrency queue). Deployment scripts are out of audit scope (`_stage/` untouched).
- Uploads: `/var/www/aintel/uploads`, served by the backend at `/uploads` through an
  authenticated streaming route with path-traversal protection (AIN-P0-03; see
  `SECURITY_AND_PRIVACY.md` S2).
- Tech: Node.js + TypeScript + Express 4 + Mongoose 7; frontend React 18 + Vite +
  Tailwind, pnpm monorepo.
- PM2 observation (2026-07-05): `aintel` shows **58,165 restarts** (uptime 45h,
  "unstable restarts 0"). **Cause RESOLVED (spec pass)**: historical boot crash-loop —
  an older compiled build hard-required `AINTEL_ALLOWED_ORIGINS`; current source falls
  back to defaults. Counter is cumulative; loop stopped. Remaining owner actions
  (verify prod dist, reset counter, PM2 backoff guardrails):
  `specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-04.

### 2. inteligent-si (public company website)

- Path: `/home/jaka/apps/inteligent-si` — static HTML site built with `build.js` +
  `pages/` + `partials/`; local git only (no GitHub remote).
- Preview: `dev.inteligent.si/predogled/`.
- Integration with AIntel: pillar landing pages (e.g. `videonadzor.html`) embed the
  AIntel inquiry widget and define `window.AINTEL = { apiBase, apiKey }` **in public
  HTML**. The widget source lives in the AIntel repo at
  `apps/web-widget/videonadzor-widget.js` and posts to `/api/public/inquiries`.
- The apiBase observed on the site points to `dev.inteligent.si/aintel-api` (a proxy
  path to an AIntel instance — Probable; nginx config not inspected).

### 3. inteligent-portal (customer portal "Moj račun")

- Path: `/home/jaka/apps/inteligent-portal` — single-file Express app (`server.js`,
  ~JS, Slovenian identifiers) + `src/modeli.js`, `src/pomozno.js`.
- PM2: `inteligent-portal`, port 4100, mounted under `/moj` (BASE_PATH).
- Preview: `dev.inteligent.si/predogled/moj`.
- Own Mongo database `inteligent_portal` (separate from AIntel).
- Auth: passwordless email login links (`PrijavniZeton` tokens), cookie session;
  admin = email allowlist from env.
- Integration with AIntel: server-to-server GET
  `/api/public/clients/equipment?email=…` with `X-API-Key` header
  (`server.js:172`) to show "Moja oprema" (customer's installed equipment).
- Local git only; not on GitHub.

## Ownership boundaries (current, de facto)

| Concern | Owner |
|---|---|
| Business data (clients, projects, offers, invoices, price list) | AIntel (`inteligent` db) |
| Customer self-service accounts, self-help guides, campaigns | inteligent-portal (`inteligent_portal` db) |
| Marketing content, lead capture UI | inteligent-si (static) |
| Lead intake API + auto-offer engine | AIntel `web-inquiries` module |
| Customer identity linking | Partially strengthened by AIN-P1-07: new AIntel Projects use `clientId`; portal ↔ AIntel still joins by **email string**, and legacy Projects still need `customer.name` fallback until owner-reviewed backfill (see `DATA_MODEL.md`) |

## Other processes on the VPS

PM2 also runs unrelated apps: `ai-vs-humanity` (cluster, port unknown), `go`.
Not audited; noted only to explain the process list.

## Email

Outbound email is sent by AIntel via SMTP (nodemailer,
`backend/modules/communication/services/email-transport.service.ts`; diagnostics logged
at startup). The portal sends its own login/notification emails
(`src/pomozno.js`). Two independent SMTP configurations — consolidation candidate.
