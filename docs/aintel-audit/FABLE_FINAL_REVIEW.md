# Final Senior Review of the AIntel Audit

Reviewer: Claude (Fable 5), final review pass.
Date: 2026-07-05. Source at commit `c0afad8`; audit docs at `7297c0c`.
Method: documentation-first review with targeted source-code verification of every
load-bearing P0 and architectural claim. This document closes the foundational audit.

## 1. Verification results — the audit's key claims hold

Every critical claim re-checked against source during this pass was **confirmed**:

| Claim | Verified at |
|---|---|
| Public router mounted pre-CORS/pre-auth | `backend/core/app.ts:42` |
| Single browser-published API key gates the whole public router, including `GET /clients/equipment` (S1) | `public.routes.ts:68-85,197`; equipment matches projects by `'customer.name'` (`:210`) |
| `/uploads` served static, unauthenticated (S2) | `backend/core/app.ts:58` |
| Finance + settings mounts have no role gate (S4) | `backend/routes.ts:36-39` |
| Finance controllers do **zero** server-side scoping; payment PATCH ungated; frontend filter is cosmetic (P0-02 spec correction) | `finance-analytics.controller.ts` (`employeesSummary`, `snapshotsList`, `employeeProjectEarningDetail`, `updateEmployeeProjectEarningPayment`); `FinancePage.tsx:369-372,591`; `core-shell App.tsx` `finance: ['FINANCE']` |
| `x-tenant-id` / `x-user-id` headers preferred over session (S3) | `backend/utils/tenant.ts:3-27` |
| Current source cannot reproduce the 58k crash-loop (`AINTEL_ALLOWED_ORIGINS` falls back to defaults, no throw) — P0-04 root cause is historical | `backend/core/app.ts:13-35` |
| `invoiceVersions` + `executionDefinitions` are `Mixed` blobs on Project; customer is an embedded copy with **no** `clientId` FK | `projects/schemas/project.ts:308-343` |
| No tasks module, no scheduler, no cron anywhere in the backend | `backend/modules/` listing; grep for cron/interval workers |

## 2. Final verdict on the current system

AIntel is a **genuinely working single-company operations system with unusual domain
depth, standing on fragile data and security foundations**. The audit's framing is
correct and well-calibrated: this is a "records system" that the business already runs
on, not yet the "operating system" the owner intends. The gap is not missing features
in the built areas — execution, offers, and invoicing are deep — it is that **nothing in
the system owns the next action**, and that the foundations (identity keys, invoice
schema, auth gates, observability, shared prod/staging DB) would make automating those
next actions dangerous if built first-without-fixing.

The audit's core strategic judgment — **no rewrite; security first, then observability,
then data keys, then the task/scheduler "wheel", refactors after, multi-tenant last** —
is sound and is hereby endorsed. See `IMPLEMENTATION_SEQUENCE.md` for the exact order.

## 3. Strongest existing capabilities (build on these)

1. **Web-inquiry → auto-priced-offer engine** — a visitor receives a priced offer with
   zero human involvement. Rare in this vertical; the wheel's first spoke.
2. **Execution evidence chain** — per-unit completion attribution, time tracking,
   photos, signature versions with re-sign flow. This is the hardest part of field-ops
   software and it already exists.
3. **Invoice → FinanceSnapshot fail-closed coupling** (D-006) — issuing aborts if the
   snapshot fails; employee earnings baked in. Preserve through every refactor.
4. **Consistent module skeleton + shared TS types** — the reason incremental
   modularization is viable at all.
5. **Communication hub** — templated, per-project logged, multi-category email with
   in-memory PDF attachments (verified: attachments do not read `/uploads`).

## 4. Highest risks

**Business:**
1. **S1 — public enumeration of customers' installed security equipment** by email,
   via a key published in website HTML. For a security-systems company this is a
   reputational *and physical-security* exposure. Fix before everything else.
2. **Payroll exposure (S4/P0-02)** — any authenticated employee can read every
   employee's earnings and toggle payment status via curl. Interpersonal/trust damage
   inside the company; the frontend hides it, the API does not.
3. **Silent revenue leak** — signed-but-uninvoiced work and unpaid invoices are
   invisible; nothing surfaces them.
4. **Bus factor 1** — mitigated only by this documentation set.

**Technical:**
1. **Shared prod/staging Mongo database** — every staging accident is a production
   accident; also blocks safe testing and migrations. Gate for all data work.
2. **Identity by name/email strings** — client↔project joined on `customer.name`;
   portal↔client on email. Every future automation would inherit wrong-customer bugs.
3. **`Mixed` invoice blobs on Project** — the highest-value data has no schema.
4. **Zero tests + console-only logging + no error tracking** on the money paths.

## 5. Corrections to the previous audit

The audit set is high quality: evidence-cited, confidence-labeled, honest about
uncertainty. Materially wrong or stale points found in this review, now corrected:

1. **P0 spec corrections were never propagated back** to the summary docs. The specs
   (`specs/P0_IMPLEMENTATION_SPECS.md`, commit `7297c0c`) correctly established that
   (a) AIN-P0-02 is a phased M-effort fix with a server-side leak and an installer
   self-service constraint, not a one-line S gate, and (b) AIN-P0-04's root cause is a
   **resolved historical boot crash-loop** (`AINTEL_ALLOWED_ORIGINS` hard-required by an
   older build), not an open mystery — yet `MASTER_BACKLOG.md`, `AUDIT_PROGRESS.md`,
   `TECHNICAL_DEBT.md` (TD-R1), `SYSTEM_CONTEXT.md`, `EXECUTIVE_SUMMARY.md` and
   `SECURITY_AND_PRIVACY.md` (S10) still carried the stale versions. **Fixed in this
   pass** in all six files. Rule going forward: specs are authoritative over backlog
   summaries; when a spec corrects a finding, update the summary docs in the same commit.
2. **AIN-P1-07 scope was stale**: `WebInquiry` **already has** `clientId`
   (`web-inquiry.model.ts:96`, set at `web-inquiry.service.ts:673`). Only **Project**
   lacks the FK. Backlog item corrected — smaller scope, same M effort due to backfill.
3. **Storage path-traversal open question** (AUDIT_PROGRESS #8) is already **folded into
   the AIN-P0-03 design** (traversal guard is part of the authenticated streaming
   route). Removed as a separate unresolved item.
4. Minor: `EXECUTIVE_SUMMARY.md` listed "restart investigation" as a this-week action —
   replaced with "restart guardrails + counter reset" per the resolved root cause.

**Judged correct after scrutiny (no change needed):** the priority of the task/scheduler
layer over deep refactors; single-DB-plus-tenantId tenancy choice; "no message broker,
no repo split"; freezing (not migrating first) the legacy embedded arrays; smoke tests
via mongodb-memory-server so they don't wait on the staging DB split.

## 6. Audit-quality assessment

- **Strengths**: consistent evidence discipline (file:line), explicit
  facts-vs-recommendations split, confidence labels, safety constraints honored
  (read-only against a shared prod DB), and a self-correcting spec pass that caught its
  own backlog's mis-scoping of P0-02/P0-04.
- **Weaknesses**: summary-doc drift after the spec pass (now fixed); one missed
  already-implemented field (WebInquiry.clientId); the "unresolved questions" list mixed
  genuinely blocking items with nice-to-haves (now curated in `AUDIT_PROGRESS.md`).
- **Not re-verified in this pass** (accepted on the audit's evidence, medium risk of
  drift): per-module deep-dive docs under `modules/`, DATA_MODEL collection-by-collection
  detail, DEAD_AND_DUPLICATED_CODE items D1–D10.

## 7. Unresolved questions (genuine, curated)

Owner-action or decision required — agents cannot resolve these alone:

1. **Atlas actual indexes** vs schema declarations (`autoIndex:false`) — owner runs
   read-only `listIndexes` (feeds AIN-P1-05).
2. **Accounting/fiscalization handoff** (D-016) — how invoices reach accounting today;
   affects the invoice-collection schema (AIN-P1-08).
3. **Finance read access for SALES** (D-012) — gate decision inside AIN-P0-02.
4. **Task/scheduler dependency choice** (D-014) — node-cron vs in-process interval.
5. **CRM people/companies vs clients consolidation** (D-017).
6. **Backup/restore procedure** for Atlas + `/var/www/aintel/uploads` — existence
   unknown; highest-severity unknown on the ops side.
7. **Repo secret scan** (S9) — never performed; run trufflehog/gitleaks read-only.
8. **Email template escaping** of customer-controlled values (S8) — quick check due
   with AIN-P2-04.
9. **nginx `dev.inteligent.si/aintel-api` proxy config** — affects the IP-allowlist
   option in AIN-P0-01.
10. **Secondary prod-log signatures** — 32× "Maximum call stack size exceeded" +
    FinanceSnapshot validation/BSONError; triage when error tracking (AIN-P1-02) lands.

## 8. Readiness for modular productization

**Not ready today; incremental path confirmed viable.** The blockers are exactly the
ones CORE_VS_CUSTOM §D lists — all data-level (header-trust tenancy, name/email identity
joins, `Mixed` blobs, Slovenian enum values persisted in data, hardcoded VAT fields,
static frontend registry), none framework-level. The monolith's uniform skeleton means
extraction is a sequencing problem, not a rewrite problem. Preconditions before any
external tenant: Phases 0–5 of `ROADMAP.md` complete, tenancy T1–T2, config store, and
one same-vertical pilot. Do not sell before the wheel demonstrably turns for Inteligent.

## 9. Authoritative documentation

- **Authoritative set**: `docs/aintel-audit/**` at this commit. Within it:
  `specs/P0_IMPLEMENTATION_SPECS.md` overrides backlog summaries for P0 scope/design;
  `IMPLEMENTATION_SEQUENCE.md` overrides all other ordering statements;
  `AINTEL_WHEEL_SPEC.md` supersedes `TARGET_OPERATING_MODEL.md` §mechanism where they
  differ (TARGET_OPERATING_MODEL remains authoritative for workflow definitions).
- **Stale/historical** (banner added, kept per no-delete rule): `docs/ARHITEKTURA.md`,
  `docs/MODULES.md`, `docs/30_REALITY.md`. Treat everything else under `docs/` outside
  `aintel-audit/` (e.g. `TODO.md`, `KOORDINACIJA.md`, `WEB_INQUIRIES.md`, `faze/`,
  `qa/`, `reports/`) as historical context — verify against code before relying on it.
  Full cleanup remains AIN-P3-08.
