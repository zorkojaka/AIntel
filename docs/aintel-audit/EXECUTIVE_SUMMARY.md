# Executive Summary — AIntel System Audit (2026-07-05)

## What AIntel is today

A working, real-world business system that already runs Inteligent d.o.o.'s core
operations: price list with supplier imports, projects with versioned offers,
automated web-inquiry-to-offer engine, material preparation, field execution with
per-unit evidence and time tracking, customer signatures, invoicing with financial
snapshots, per-project email communication log, and customer reviews. It is a modular
monolith (Node/TypeScript/Express/MongoDB + React) with ~35k lines of backend and
~42k lines of frontend TypeScript, developed fast and single-handedly — and it shows
both the strengths (deep domain fit) and costs (debt, no tests, no observability) of
that pace.

## Strengths

1. **Domain depth competitors don't have**: auto-quoting from structured requirements,
   execution-unit-level evidence, work-order confirmation versions with re-signing,
   employee earnings baked into invoice snapshots.
2. **Consistent skeleton**: uniform module layout, one response envelope, shared
   TS types between backend and frontend, clean auth core.
3. **The wheel's first spoke already turns**: a website visitor can receive a priced
   offer with zero human involvement.

## Main weaknesses

1. **Nothing prompts the next step.** No tasks, reminders, deadlines, or scheduler —
   every handoff depends on someone remembering to look. This is the gap between
   "records system" and the intended "operating system".
2. **Fragile data foundations**: customer↔project linked by name string; invoices
   stored as schema-less blobs; legacy duplicate structures still writable.
3. **Blind operations**: console-only logging, no error tracking, zero backend tests —
   on a **shared production/staging database**. (The 58k process restarts were
   explained during the spec pass: a historical, already-fixed boot crash-loop —
   see `specs/P0_IMPLEMENTATION_SPECS.md` §AIN-P0-04.)
4. **Security exposures** (partly resolved): a public API key printed in website HTML
   that also unlocks customer equipment lookups remains in rollout; photo/file serving
   is authenticated (AIN-P0-03); finance/settings authorization is fixed (AIN-P0-02).

## Major business risks

- Public exposure of what security equipment customers have installed (S1) —
  reputational and physical-security risk. **Fix first.**
- Signed-but-uninvoiced work and unpaid invoices are invisible → silent revenue leak.
- A staging accident can corrupt production data at any time.
- Bus factor: system knowledge lives in one head; this documentation set is the
  first mitigation.

## Highest-value opportunities

1. **Task + scheduler layer** (Phase 3 of roadmap): converts existing data into an
   engine that assigns the next action for inquiries, offers, preparation, invoicing —
   the single biggest step toward the vision, achievable without refactoring.
2. **Payment tracking + "unbilled work" report**: direct cash impact.
3. **Service & maintenance module**: closes the lifecycle and creates recurring
   revenue plus systematic repeat sales.

## Readiness for other companies

Not yet. Tenancy is partial and unsafe (client-supplied tenant header), Slovenian
enum values live in the database, the vertical (CCTV/alarm) is hardcoded into models,
and configuration is scattered. However, the structure supports **incremental**
extraction — no rewrite is needed. Realistic sequence: make the wheel turn for
Inteligent first (Phases 0–5), then tenancy + configuration (Phase 6), then one
friendly same-vertical pilot (Phase 7).

## Recommended next steps

1. This week: finish remaining P0 owner rollout items (API key rotation, PM2
   guardrails + counter reset).
2. Next: staging DB separation, error tracking, structured logging, and owner-run
   Atlas index dry-run/apply.
3. Then: clientId + real invoice collection, followed by the task/scheduler layer
   (design: `AINTEL_WHEEL_SPEC.md`).
4. Authoritative order: `IMPLEMENTATION_SEQUENCE.md`; agent-ready items:
   `MASTER_BACKLOG.md` (P0 design detail in `specs/P0_IMPLEMENTATION_SPECS.md`).
