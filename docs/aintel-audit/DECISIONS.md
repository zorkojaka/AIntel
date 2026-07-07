# Decision Log (ADR-style)

Types: **[Existing-confirmed]** (documented/stated), **[Existing-inferred]** (read from
code — verify with owner before relying on rationale), **[Open]** (needs decision).
Add new entries at the bottom; never rewrite old ones — supersede them.

## D-001 [Existing-confirmed] Backend is the source of truth
From `AGENTS.md`: frontend must not infer business logic. Keep enforcing in reviews.

## D-002 [Existing-inferred] Modular monolith, single deployable
One Express app, one SPA bundle, pnpm monorepo. No evidence of intent to split
deployables. Audit endorses keeping it (MODULARIZATION_PLAN).

## D-003 [Existing-inferred] Cookie-JWT session, roles on Employee with User fallback
`middlewares/auth.ts`. Contract documented in USER_ROLES_AND_PERMISSIONS.md.

## D-004 [Existing-inferred] Uniform `{success,data,error}` response envelope
`core/response.ts`; all modules comply.

## D-005 [Existing-inferred] Single products collection for products and services
`isService` flag instead of separate collections; product-service links for
auto-adding labor to offers.

## D-006 [Existing-inferred] Invoice issue requires finance snapshot (fail-closed)
`invoice.service.ts:556` aborts issue if snapshot fails — consistency over
availability. Good decision; preserve through refactors.

## D-007 [Existing-inferred] Offers/work orders moved from embedded arrays to
collections; migration left unfinished
Both representations exist (P1/P2 duplication). Decision to finish (freeze embedded)
is AIN-P2-01 — treat as accepted direction, pending owner confirmation.

## D-008 [Superseded by AIN-P0-01] Public intake protected by shared static API key
Original decision was made for simplicity; consequences in S1. AIN-P0-01 supersedes it:
browser widget/review endpoints keep `AINTEL_WEB_INQUIRY_API_KEY`, while
`/api/public/clients/*` server-to-server endpoints require `AINTEL_INTERNAL_API_KEY`.
Owner still controls env rollout and browser-key rotation.

## D-009 [Existing-confirmed] Prod and staging share one Mongo database
Operational reality (audit brief). Risk accepted historically; recommendation to
supersede via AIN-P1-01.

## D-010 [Superseded by AIN-P2-09] Tenant passed as client header with server fallback
AIN-P2-09 removed `buildTenantHeaders` and changed backend tenant/actor helpers to
ignore `x-tenant-id`/`x-user-id`. Tenant/actor identity now comes from server-side
session context/user fallbacks; AIN-P2-10 remains for business-data tenant scoping.

## D-011 [Existing-confirmed] Reviews: auto-publish 4–5★, Google redirect,
auto-request behind default-off flag
Commits 896f1ae, 59b1d55.

## D-012 [Existing-confirmed] Finance company read access is ADMIN+FINANCE only
AIN-P0-02 shipped the strict default from the P0 spec: SALES does not get company
finance reads. EXECUTION keeps a scoped self-service earnings view through
`/api/finance/my/earnings`; company finance endpoints and payment PATCH are
ADMIN+FINANCE. **Owner (Jaka) explicitly confirmed the strict default on 2026-07-06**
(review sign-off); granting SALES read access later would be a purely additive change.

## D-013 [Open] PDF engine consolidation: pdfkit vs playwright-HTML
Two pipelines maintained (P6). Decide one (playwright-HTML is more maintainable;
pdfkit is lighter — also interacts with TD-R3 dependency weight).

## D-014 [Open] Task/scheduler implementation choice
In-process interval vs node-cron vs agenda (new dependency requires owner approval
per CLAUDE.md). Blocking AIN-P1-10.

## D-015 [Open] Tenant data isolation model
Single DB + tenantId assumed in MODULARIZATION_PLAN; confirm before Stage 5.

## D-016 [Open] Accounting handoff
No integration exists. Decide: export format (e-SLOG?), fiscalization requirements,
or explicit "manual accounting" statement. Affects invoice module roadmap.

## D-017 [Open] CRM people/companies vs clients consolidation
D6/P10: keep clients as master? Fold people/companies into contacts-on-client?
Blocks CRM expansion work.

## D-018 [Existing-confirmed] Documentation authority order (final review, 2026-07-05)
Where audit documents disagree: `FABLE_FINAL_REVIEW.md` corrections →
`specs/P0_IMPLEMENTATION_SPECS.md` (P0 scope/design) and `AINTEL_WHEEL_SPEC.md`
(task/scheduler hub design) → `IMPLEMENTATION_SEQUENCE.md` (execution order) → topic
docs. Rule: when a spec corrects a finding, the summary docs must be updated in the
same commit (the P0-02/P0-04 drift that motivated this is fixed).

## D-019 [Open] Wheel hub design sign-off
`AINTEL_WHEEL_SPEC.md` is the proposed design for tasks/scheduler/automation
(AIN-P1-09..12). Owner + senior review must sign off on §2 (Task schema) and §3 (rule
engine) before implementation starts; interacts with D-014 (scheduler dependency).
