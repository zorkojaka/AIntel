# Module: communication (backend)

Reviewed at `c0afad8` — depth: deep (service surface), High confidence.

## Purpose
All outbound email + per-project communication log: offers, invoices, work-order
confirmations, installer preparation, review links; templates; sender settings;
health/diagnostics.

## Surface
- `/api/settings/communication` (+`/health`, `/templates` CRUD) — GET/health/list are
  auth-only; sender settings and template writes are ADMIN only (AIN-P0-02).
- `/api/projects/:projectId/communication/feed`, `/offers/:offerVersionId/messages`,
  `/messages/:messageId`, `/review-link` (mounted into projects space).
- Send controllers are invoked from **projects routes** (send offer/invoice/wo-confirm/
  installer-prep) — module boundary crosses both ways (TD-C1).
- Services: `communication.service.ts` (1,554 — one send function per document type,
  each building context, rendering template, resolving attachment PDF, sending,
  logging message+event), `email-transport.service.ts` (nodemailer, cached transport,
  startup diagnostics, env-driven staging email trap), `template-render.service.ts`
  ({{placeholders}}, footer),
  `attachment-resolver.service.ts` (renders the right PDF per category).

## Data
`communicationmessages` (full outbound record incl. body), `communicationevents`
(project feed), `communicationtemplates` (per category, active flag, fallback to first
active offer_send template — commit `465aec9`), `sendersettings` (singleton).
The message/event schemas already declare project feed indexes; AIN-P1-05's
ensure-indexes script is the explicit deployment path because `autoIndex` is off.

## Strengths
Every business email is logged and browsable per project — a real audit trail for
customer-facing communication; template fallbacks; SMTP diagnostics at startup.

## Problems
1. Four near-identical 200–300-line send functions (offer/invoice/wo/installer) —
   copy-paste divergence risk; unify into one pipeline with per-category config.
2. RESOLVED (AIN-P1-06): installer-prep flow now validates `workOrderId` in the
   controller and service before the WorkOrder lookup; the old TD-B7 cast path returns
   a clean 400.
3. Sending is synchronous in-request (except inquiry offer email, made async in
   `465aec9`); SMTP latency blocks API responses; no retry/queue — a failed send is
   only a log entry (message status field exists — verify retry semantics: Needs
   verification).
4. RESOLVED for current email sends: template variables are rendered into the text
   body as plain text and escaped when the HTML body is built via
   `renderCommunicationBodyHtml`; test coverage added for customer-controlled token
   values (S8 partial).
5. AIN-P1-01 added an env-driven email trap in the shared transport:
   `AINTEL_EMAIL_TRAP_TO` redirects outgoing mail, strips cc/bcc, prefixes the subject,
   and records original recipients in headers. Owner must still enable it in staging.
6. No inbound email; replies invisible to system.

## Reuse potential
High — generic "communication hub" is core-product material once decoupled from
project schemas (accept a context object instead of importing models).

## Confidence
High on structure; send-function internals sampled, not exhaustively read.
