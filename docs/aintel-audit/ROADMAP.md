# Roadmap

**Recommendation document.** Phases are sequential but overlappable; each ends with a
verifiable outcome. Backlog IDs reference MASTER_BACKLOG.md.

## Phase 0 — Stop the bleeding (days)
Security P0s: split/rotate public API key (AIN-P0-01), role-gate finance & settings
(AIN-P0-02), auth on uploads (AIN-P0-03), investigate PM2 restarts (AIN-P0-04).
Outcome: no publicly reachable customer data; sensitive modules role-gated.

## Phase 1 — Stabilization (1–2 weeks equivalent)
Separate staging DB + staging email trap (AIN-P1-01); error tracking + structured
logging (AIN-P1-02/03); fix known prod bug installer-prep ObjectId (AIN-P1-06);
ensure-indexes script + Atlas index audit (AIN-P1-05); smoke tests for five money
flows (AIN-P1-04). Outcome: safe to change code; failures visible.

## Phase 2 — Data foundations (2–4 weeks equivalent)
clientId linkage (AIN-P1-07); invoiceVersions to real collection (AIN-P1-08); freeze
legacy embedded arrays (AIN-P2-01); expectedAt + supplier normalization start
(AIN-P2-05); date-string cleanup on new writes. Outcome: stable identity keys; invoices
on a real schema.

## Phase 3 — The wheel: tasks, scheduler, state machines (the big product step)
Task entity + inbox (AIN-P1-09); scheduler worker (AIN-P1-10); first automation
rules: offer follow-up/expiry, signed→invoice task, inquiry SLA (AIN-P1-11);
state-machine layer wrapping existing statuses (AIN-P2-02); invoice payment tracking
(AIN-P1-12). Outcome: system prompts every next step; unbilled work surfaces itself.

## Phase 4 — Structure & quality
Extract logistics services (AIN-P2-03); unify communication sends (AIN-P2-04); split
3k-line frontend panels along domains/ (AIN-P2-06); shared API client (AIN-P3-02);
audit log middleware (AIN-P2-07). Outcome: core flows testable and safely changeable.

## Phase 5 — Service & repeat-sale modules
Service tickets + maintenance plans (AIN-P2-08); repeat-sale rules (AIN-P3-03);
portal: tickets + offer acceptance (AIN-P3-04). Outcome: lifecycle closes the loop
(service → repeat sale) — last missing business phase.

## Phase 6 — Multi-company foundations
Tenancy T1→T2 (AIN-P2-09/10); config store + module activation (AIN-P2-11); vertical
package extraction (AIN-P3-05); enum neutralization (AIN-P3-06). Outcome: a second
tenant is technically possible.

## Phase 7 — First external pilot & productization
Pilot with a friendly same-vertical company (AIN-P3-07); tenant provisioning,
per-tenant SMTP, billing decision; docs for operators. Outcome: evidence AIntel works
outside Inteligent; go/no-go for productization investment.

## Sequencing rationale
Security first (active exposure), then observability (shared prod DB makes blind
changes dangerous), then data keys (everything later builds on clientId + real
invoice schema), then the task/scheduler layer — the single highest business-value
step — before deep refactors, because it delivers owner-visible value using existing
data. Multi-company work comes last: it monetizes only after the wheel actually turns
for Inteligent itself.
