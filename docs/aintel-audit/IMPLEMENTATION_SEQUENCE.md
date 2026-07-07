# Implementation Sequence

Authoritative execution order for the audit roadmap. Overrides ordering statements in
`ROADMAP.md` / `MASTER_BACKLOG.md` where they differ. Scope/design per item stays in
`MASTER_BACKLOG.md` and `specs/P0_IMPLEMENTATION_SPECS.md` (authoritative for P0).
Produced by the final review (`FABLE_FINAL_REVIEW.md`), 2026-07-05.

Legend: **[agent]** = assignable to a coding agent as specified; **[owner]** = requires
Jaka (env, keys, infra, DB, decisions); **[senior]** = senior architectural review
required before merge/rollout.

## Ground rules

1. Until AIN-P1-01 lands, **no work item may write to the database** from staging or
   scripts — prod and staging share db `inteligent`. Tests use mongodb-memory-server.
2. Every wave ends with a checkpoint: verify acceptance criteria, update docs per
   `DOCUMENTATION_MAINTENANCE.md`, bump `AUDIT_PROGRESS.md` last-reviewed commit.
3. Each item's rollback path is noted in its spec/backlog entry; do not start an item
   whose rollback you cannot state.

## Wave 0 — Security (start immediately; items are parallel-safe, disjoint files)

| Order | Item | Assignee | Notes |
|---|---|---|---|
| 0.1 | **AIN-P0-01** key split + rotation | [agent] DONE: code + tests; [owner] env+rollout remains | Internal key is now required for `/clients/*`; owner must set AIntel/portal env and rotate browser key on website/widget |
| 0.2 | **AIN-P0-02** finance auth (phased) | [agent] backend phase 1, then frontend phase 2 | DONE. D-012 strict default owner-confirmed 2026-07-06: company finance ADMIN/FINANCE only, installer self view scoped server-side. Deploy backend + SPA together |
| 0.3 | **AIN-P0-03** authenticate `/uploads` | [agent] | Includes the path-traversal guard; pre-ship grep of communication templates for embedded `/uploads` `<img>` |
| 0.4 | **AIN-P0-04** restart guardrails | [owner] only | Verify prod dist has no `required in production` throw; set `AINTEL_ALLOWED_ORIGINS`; `pm2 reset aintel`; add `max_restarts`/`min_uptime`/`restart_delay`. No app code |

**Checkpoint W0**: equipment endpoint rejects browser key; EXECUTION user gets 403 on
company finance + settings writes but sees own earnings; unauth `/uploads` → 401;
restart counter reset. Update SECURITY_AND_PRIVACY (S1, S2, S4 → RESOLVED),
USER_ROLES findings 1–2, DECISIONS (supersede D-008; record D-012 outcome).
**Rollback**: each item independently revertible (see specs); revert = documented
regression, not data loss.

## Wave 1 — Stabilization (after W0 merged; most items parallel)

| Order | Item | Assignee | Depends on |
|---|---|---|---|
| 1.1 | **AIN-P1-01** staging DB split + email trap | [owner] infra, [agent] docs/config review | — (unblocks all DB-writing work; schedule first) |
| 1.2 | **AIN-P1-06** installer-prep ObjectId guard | [agent] | — (S effort; can even ride along with W0) |
| 1.3 | **AIN-P1-02** error tracking | [agent] after [owner] picks Sentry vs GlitchTip | — |
| 1.4 | **AIN-P1-03** structured logging (pino + request IDs) | [agent] | [owner] approves dependency |
| 1.5 | **AIN-P1-04** smoke tests, five money flows | [agent] | Uses memory-server → does NOT wait on 1.1 |
| 1.6 | **AIN-P1-05** index audit + ensure-indexes script | [agent] script DONE, [owner] runs dry-run/apply | Script landed; owner still runs read-only `db:ensure-indexes -- --json` and guarded apply if needed |

Parallelism: 1.2–1.6 can all run concurrently; 1.1 is owner-paced.
**Checkpoint W1**: `pnpm test` green without touching Atlas; one JSON log line per
request in staging; a thrown test error appears in the tracker; staging writes go to a
separate DB. **This checkpoint is the safety gate for everything below.**

## Wave 2 — Data foundations (after W1 checkpoint; sequential within, 2.1 ∥ 2.3)

| Order | Item | Assignee | Depends on |
|---|---|---|---|
| 2.1 | **AIN-P1-07** clientId on **Project** (corrected scope — WebInquiry already has it) | [agent] DONE: code + read-only backfill report; [owner] still reviews report and runs any future backfill | 1.1 (real-DB backfill), 1.5 (index for clientId) |
| 2.2 | **AIN-P1-08** invoiceVersions → real collection | [agent] [senior] schema + migration review | 1.4 (smoke tests exist), 2.1 preferred, D-016 answered (accounting handoff shapes the schema) |
| 2.3 | **AIN-P2-01** freeze legacy embedded offers/POs/deliveries (usage counters → remove writes → archive) | [agent] | 1.3 (counters need logs) |

**Checkpoint W2**: new projects carry clientId; equipment endpoint joins by clientId
with name fallback; new invoices write to the collection with dual-read fallback
verified by smoke tests. **Rollback**: dual-read/dual-write windows mean either change
can be reverted without data loss; backfill scripts are dry-run-first and idempotent.

## Wave 3 — The wheel (the product step; after W2 checkpoint)

Design source: `AINTEL_WHEEL_SPEC.md` (authoritative), workflows in
TARGET_OPERATING_MODEL. [senior] review of the Task schema + rule engine **before**
coding starts — this is the system's future hub; schema mistakes here compound.

| Order | Item | Assignee | Depends on |
|---|---|---|---|
| 3.1 | **AIN-P1-09** Task entity + inbox (manual tasks only) | [agent] after [senior] schema sign-off | W2 checkpoint |
| 3.2 | **AIN-P1-10** scheduler worker | [agent] | D-014 decided [owner]; 1.4 logging |
| 3.3 | **AIN-P1-11** first automation rules (5 rules per wheel spec §6) | [agent] | 3.1 + 3.2 |
| 3.4 | **AIN-P1-12** invoice payment tracking + overdue rule | [agent] | 2.2, 3.3 |
| 3.5 | **AIN-P2-02** state-machine layer (wrap existing statuses) | [agent] [senior] transition-map review | 1.4; can start parallel to 3.3 |

Parallelism: 3.1 and 3.2 in parallel; 3.5 parallel to 3.3/3.4.
**Checkpoint W3** (business-visible): an unanswered inquiry, an expiring offer, and a
signed-but-uninvoiced project each generate a visible task without human polling;
management sees the overdue list. This is the go/no-go evidence that the wheel concept
works. **Rollback**: automation rules are individually disableable via config
(wheel spec §7); the tasks module is additive — disabling rules returns the system to
manual behavior without data damage.

## Wave 4 — Structure & quality (after W3; largely parallel, refactor-heavy)

AIN-P2-03 (extract logistics services — [senior] review), AIN-P2-04 (unify
communication sends; do the S8 escaping check here), AIN-P2-06 (split 3k-line panels),
AIN-P3-02 (shared API client), AIN-P2-07 (audit-log middleware — pairs naturally with
the wheel's audit trail), AIN-P2-05 (supplier normalization + expectedAt — may be pulled
into W3 if late-delivery rules are wanted early). All [agent] with characterization
tests first.

## Wave 5 — Service & repeat sales

AIN-P2-08 service module ([senior] entity design) → AIN-P3-03 repeat-sale rules →
AIN-P3-04 portal integration (needs 2.1 clientId).

## Wave 6 — Multi-company foundations

AIN-P2-09 kill header trust DONE (S3 resolved in code) →
AIN-P2-10 tenantId backfill ([owner] runs) → AIN-P2-11 config store ([senior]) →
AIN-P3-05/06 vertical extraction + enum neutralization ([senior], data migration).

## Wave 7 — Pilot

AIN-P3-07 external pilot ([owner]-led); AIN-P3-08 docs cleanup can happen any time.

## Where senior architectural review is mandatory

1. AIN-P0-01 rollout sequencing (key rotation across three apps).
2. AIN-P1-08 invoice collection schema + migration plan.
3. Task schema + automation rule engine (before 3.1/3.3 coding).
4. AIN-P2-02 state-machine transition maps (encodes business rules).
5. AIN-P2-03 logistics service boundaries.
6. Service module entities (W5) and config store + tenancy design (W6).

## Standing documentation duties (every wave)

- Same-PR doc updates per `DOCUMENTATION_MAINTENANCE.md` matrix.
- Mark backlog items done (move to `## Done` with landing commit).
- Mark SECURITY/TECHNICAL_DEBT findings `RESOLVED (commit …)` — never delete.
- Record decisions (D-012/13/14/16/17 outcomes) in `DECISIONS.md` as they are made.
- Bump `AUDIT_PROGRESS.md` "last reviewed commit" per touched area.
