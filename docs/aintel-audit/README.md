# AIntel System Audit Documentation

## Purpose

This directory is the canonical, version-controlled knowledge base produced by the
foundational system audit of AIntel (July 2026). It exists so that:

1. Future coding agents (Claude Code, Codex) and human developers can understand the
   system without re-auditing the whole repository.
2. Architectural decisions, technical debt, and the modularization roadmap are recorded
   with evidence and confidence levels.
3. Work items can be handed off directly from `MASTER_BACKLOG.md`.

## Audit snapshot

| Item | Value |
|---|---|
| Audit date | 2026-07-05 |
| Repository | github.com/zorkojaka/AIntel |
| Worktree | `/home/jaka/apps/aintel-staging/AIntel-web-intake` |
| Branch reviewed | `codex/web-inquiries-intake` |
| Commit reviewed | `c0afad8f92320ba48eddfcaec7a5b52d859c7b2e` (2026-07-03) |
| Audit mode | Strictly read-only (shared production DB — no writes of any kind) |
| Status | **Complete** — incl. final review (`FABLE_FINAL_REVIEW.md`); see `AUDIT_PROGRESS.md` |

## Document index and recommended reading order

**Start here (orientation):**
1. `README.md` — this file.
2. `AGENT_HANDOFF.md` — how to work in this system safely.
3. `SYSTEM_CONTEXT.md` — the three applications, runtimes, domains, databases.
4. `EXECUTIVE_SUMMARY.md` — management-level state of the system.

**Current state (facts):**
5. `CURRENT_ARCHITECTURE.md` — layers, runtime flow, diagrams.
6. `MODULE_CATALOG.md` — all backend + frontend modules with status and links.
7. `modules/<name>.md` — per-module deep dives.
8. `DATA_MODEL.md` — collections, schemas, relationships.
9. `USER_ROLES_AND_PERMISSIONS.md` — roles and enforcement.
10. `CURRENT_USER_FLOWS.md` — implemented end-to-end flows (incl. gaps).
11. `INTEGRATION_MAP.md` — AIntel ↔ website ↔ portal ↔ email ↔ external APIs.

**Assessment (facts + findings):**
12. `SECURITY_AND_PRIVACY.md`
13. `TECHNICAL_DEBT.md`
14. `DEAD_AND_DUPLICATED_CODE.md`

**Future direction (recommendations — NOT current state):**
15. `TARGET_OPERATING_MODEL.md` — how AIntel should guide the full business lifecycle.
16. `CORE_VS_CUSTOM.md` — generic core vs. Inteligent-specific functionality.
17. `MODULARIZATION_PLAN.md` — incremental path to a multi-company product.
18. `ROADMAP.md` — phased plan.
19. `MASTER_BACKLOG.md` — prioritized, agent-ready work items.
20. `DECISIONS.md` — ADR-style decision log.

**Implementation handoff (final review, 2026-07-05 — read before coding):**
21. `FABLE_FINAL_REVIEW.md` — final verdict, verified claims, corrections, what is
    authoritative.
22. `IMPLEMENTATION_SEQUENCE.md` — **authoritative execution order** (waves,
    dependencies, parallelism, checkpoints, agent vs. owner vs. senior review).
23. `specs/P0_IMPLEMENTATION_SPECS.md` — authoritative P0 designs (override backlog
    summaries).
24. `AINTEL_WHEEL_SPEC.md` — authoritative design for the task/scheduler/automation hub.

**Process:**
25. `DOCUMENTATION_MAINTENANCE.md` — how to keep all of this current.
26. `PROPOSED_CLAUDE_MD_CHANGES.md` — suggested durable additions to root `CLAUDE.md`.

## Facts vs. recommendations

Documents 1–14 describe the system **as it is** at the reviewed commit. Documents 15–24
describe **where it should go**; nothing in them is implemented unless the backlog item is
marked done. Every important claim carries a confidence label:
`Confirmed` / `High confidence` / `Probable` / `Needs verification`.
Where documents disagree, the authority order is: `FABLE_FINAL_REVIEW.md` corrections →
`specs/P0_IMPLEMENTATION_SPECS.md` (P0 scope/design) and `AINTEL_WHEEL_SPEC.md` (wheel
design) → `IMPLEMENTATION_SEQUENCE.md` (ordering) → the topic documents.

## How future agents should update this documentation

- After any code change, consult `DOCUMENTATION_MAINTENANCE.md` for which documents to touch.
- Update `AUDIT_PROGRESS.md` whenever an area is (re)reviewed; bump the "last reviewed commit".
- Never delete findings — mark them `RESOLVED (commit …)` or `OBSOLETE (reason)`.
- Keep root `CLAUDE.md` short; detailed knowledge belongs here and is referenced from there.
- Do not record secrets, credentials, tokens, or customer personal data in any document.

## Safety constraints (permanent)

- Production and staging share the Mongo Atlas database `inteligent`. **All DB access is
  production access.** Do not run seeds, migrations, tests, or scripts that write.
- Never open or print `.env` files.
- `_stage/` and deployment configuration are off-limits without explicit instruction.
