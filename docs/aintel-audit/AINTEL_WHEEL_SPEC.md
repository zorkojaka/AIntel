# AIntel Wheel Specification — the operating hub

Status: **design specification, not implemented.** Authoritative design for backlog
items AIN-P1-09/10/11/12 and the automation parts of AIN-P2-02. Workflow definitions
(states per business entity, SLAs, required fields) live in `TARGET_OPERATING_MODEL.md`;
this document defines the **mechanism** that executes them and supersedes
TARGET_OPERATING_MODEL §"core mechanism" where they differ. Senior review of §2–§3 is
required before implementation (see IMPLEMENTATION_SEQUENCE W3).

## 1. Concept

The wheel = every business object always has an **owner**, a **next action**, and a
**deadline**; when a step completes, the system creates/resolves the next action
automatically. Three primitives deliver this: **Task**, **Rules** (automation), and a
**Scheduler**. They are additive — no existing schema changes, no data migration; the
wheel wraps current statuses instead of replacing them.

## 2. Task — the hub entity

New backend module `tasks` (platform-core layer; follows the existing module skeleton).

```ts
interface Task {
  _id: ObjectId;
  tenantId: string;                    // 'inteligent' constant until tenancy T1
  type: string;                        // machine key, e.g. 'inquiry.call', 'offer.follow_up',
                                       // 'invoice.issue', 'material.order', 'manual'
  title: string;                       // display (SL), prefilled per type
  description?: string;
  subject: {                           // what the task is about — exactly one ref
    kind: 'project' | 'inquiry' | 'client' | 'offerVersion' | 'workOrder'
        | 'materialOrder' | 'invoice' | 'serviceTicket' | 'none';
    id?: ObjectId;
    label?: string;                    // denormalized display ("PRJ-0142 – Novak")
  };
  assigneeEmployeeId?: ObjectId;       // person…
  assigneeRole?: Role;                 // …or role pool ('SALES' inbox); at least one set
  status: 'open' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  blockedReason?: string;             // required when status='blocked'
  priority: 'low' | 'normal' | 'high' | 'urgent';
  dueAt?: Date;                        // real Date, not string (do not copy TD-B5)
  slaBreachedAt?: Date;                // set by scheduler when dueAt passes while open
  source: { kind: 'user' | 'rule'; ruleKey?: string; userId?: ObjectId };
  dedupeKey?: string;                  // unique-sparse; rules use it for idempotency,
                                       // e.g. 'offer.follow_up:<offerVersionId>'
  resolution?: { outcome: string; note?: string; resolvedBy: ObjectId; resolvedAt: Date };
  createdAt: Date; updatedAt: Date;
}
```

Indexes: `{tenantId, status, assigneeRole, dueAt}`, `{tenantId, assigneeEmployeeId,
status}`, `{subject.kind, subject.id}`, unique sparse `{dedupeKey}`. Declared in schema
**and** added to the ensure-indexes script (autoIndex is off — AIN-P1-05).

**Owner semantics**: a task always has an owner — a specific employee, or a role pool
until someone claims it (claim = set assigneeEmployeeId + status in_progress). SLA
escalation (§6) makes unclaimed/overdue tasks visible upward, so nothing can sit
ownerless silently.

**Blockers**: `status='blocked'` + mandatory `blockedReason`; blocked tasks stay in the
owner's list, are excluded from overdue escalation, and appear in the management "stuck"
view. A rule may auto-unblock (e.g. material delivered → unblock the scheduling task).

### API (mounted `/api/tasks`, requireAuth; write gates per role)

- `GET /tasks/my` — union of assigneeEmployeeId = me and role-pool tasks for my roles;
  filters: status, dueBefore, subject.kind. Powers the inbox + shell badge (open count).
- `GET /tasks?…` — ADMIN/management list with aging + filters.
- `GET /tasks/by-subject/:kind/:id` — task strip on project/inquiry detail pages.
- `POST /tasks` — manual creation (any authenticated user).
- `PATCH /tasks/:id` — claim, complete (with resolution), block, reassign, reschedule.
- All mutations append to the audit trail (§8).

### Inbox UI (core-shell)

"Opravila" page + badge in the shell nav: My tasks (due-date ordered, overdue red) /
my roles' pool / done-today. Task rows deep-link to the subject entity. Project and
inquiry detail views show their open tasks inline (via by-subject).

## 3. Rules — automation

A rule = pure function evaluated either on an **event** (in-process, at the mutation
site) or on a **schedule** (scanner query). No message broker; direct service calls
from the ~6 existing mutation points, plus scheduler scans for time-based conditions.

```ts
interface RuleDefinition {
  key: string;                         // 'offer.follow_up'
  trigger: { kind: 'event'; event: string } | { kind: 'scan'; cron: string };
  enabled: (config) => boolean;        // per-rule kill switch, config-driven
  execute(ctx): Promise<RuleOutcome>;  // creates/resolves tasks via task.service,
                                       // sends notifications; MUST be idempotent
}
```

Idempotency contract: every rule-created task carries a deterministic `dedupeKey`; the
unique index makes double-firing harmless. Rules **resolve** tasks too (customer paid →
auto-complete the reminder task).

### Initial rule set (= AIN-P1-11 + P1-12; each maps to a TARGET_OPERATING_MODEL workflow)

| Key | Trigger | Effect |
|---|---|---|
| `inquiry.first_contact` | event: inquiry created | Task `inquiry.call` → SALES pool, due +4 working hours (auto-offer inquiries: "preveri ponudbo + follow-up klic", due next business day); nextStep=posvet/ogled → matching task immediately |
| `inquiry.stale_escalation` | scan hourly | inquiry `new` > 1 business day & no open/done contact task → escalate to ADMIN |
| `offer.follow_up` | scan hourly | OfferVersion sent +3 days, no response → task `offer.follow_up` → offer owner, due +1 day |
| `offer.expiry` | scan daily | validUntil passed & not accepted → mark expired (via state layer once AIN-P2-02 exists; until then status write) + task "obnovi ali zapri" |
| `invoice.after_signature` | event: signature saved | Task `invoice.issue` → FINANCE pool, due +2 working days. **Closes the biggest revenue leak** |
| `invoice.overdue` | scan daily | issued & dueDate passed & not paid → task + reminder email (needs AIN-P1-12 payment fields) |

Later waves add: material `expectedAt` late-delivery (W4, needs AIN-P2-05), maintenance
generation and equipment-age repeat-sale rules (W5, service module).

## 4. Scheduler

One in-process worker started with the backend (design per D-014 — final dependency
choice is the owner's; node-cron or a plain interval loop both acceptable):

- **Job registry**: `{ key, cron, handler }`; jobs are rule scans (§3), SLA sweep (§6),
  digest emails (§7).
- **Locking**: `scheduler_locks` collection, `findOneAndUpdate` lease with TTL —
  correct today (single PM2 fork) and safe if the process is ever clustered.
- **Run log**: `scheduler_runs` (key, startedAt, finishedAt, outcome, error, counts) —
  the wheel must be observable; a silent dead scheduler is worse than none. Error
  tracking (AIN-P1-02) alerts on consecutive failures.
- **Working-time awareness**: due-date arithmetic uses working hours/days from config
  (§9) — "4 delovne ure" must not land on Sunday.

## 5. Deadlines & SLA

- Every rule-created task gets a `dueAt` from its per-type SLA in config (§9); defaults
  per TARGET_OPERATING_MODEL (inquiry 4 working hours, offer follow-up 3 days, invoice
  2 working days, ogled within 5 working days…).
- SLA sweep job: open tasks past dueAt → set `slaBreachedAt`, notify assignee; breach
  older than the escalation window → notify role fallback, then ADMIN digest.
- Task list ordering and dashboards key off dueAt/slaBreachedAt — one mechanism,
  every workflow inherits it.

## 6. Workflow states

Business-entity states remain on their existing schemas (inquiry status, offer status,
material steps, work-order status, invoice status) — the wheel does **not** move state
storage. AIN-P2-02 later wraps transitions in a declarative layer (allowed transitions,
required fields, side effects) whose side-effect hook is exactly "emit rule event"
(§3). Until then, rule events are called directly from the existing mutation sites:
inquiry create (web-inquiry.service), offer send / status change, signature save,
invoice issue, material advance, payment mark (new in AIN-P1-12).

## 7. Notifications

- **In-app**: the inbox + shell badge is the primary channel (poll `/tasks/my` count;
  no websockets needed at this scale).
- **Email** (existing communication module as transport): task assigned (per-user
  preference, default on for direct assignment, off for pool), SLA breach, and digests.
- **Digests** (scheduler jobs): daily per-role 07:00 (my due/overdue tasks, my
  blockers); weekly management (pipeline by state+aging, stuck list, unbilled signed
  work, AR aging).
- All templated through the existing communication templates so per-tenant branding
  keeps working later.

## 8. Audit trail

- Every task mutation appends `{at, byUserId, action, changes}` to a capped `history`
  array on the task (self-contained, no new infra).
- Rule executions are attributable via `source.ruleKey` + scheduler run log.
- The generic mutating-route audit middleware stays a separate item (AIN-P2-07) and
  complements this; when it lands, task mutations flow into it too.
- **Actor identity must come from `req.context`** — never from `x-user-id`
  (S3; the wheel must not inherit the header-trust pattern).

## 9. Configuration

Namespace `config.wheel.*` (seed of the future config store, AIN-P2-11): per-rule
enable flags, SLA durations per task type, working hours/days + holidays, escalation
window, digest send times, role fallback map. Stored via the settings module for now;
zod-validated at read. **Every automation rule ships disabled and is enabled one by
one in production** — this is also the rollback mechanism (disable rule = system
returns to manual behavior; tasks are additive data, no cleanup required).

## 10. Management dashboards

Wave 3 delivers list-based views (dashboard module is currently a stub — start simple):

1. **Overdue & aging tasks** by role/assignee (from tasks alone).
2. **Pipeline with aging** — offers by state + days-in-state, expiring this week.
3. **Stuck list** — blocked tasks + rule-detected stuck states (expired offer still
   `offered`, material `Naročeno` without movement, WO completed w/o invoice).
4. **Unbilled & AR** — signed-not-invoiced (rule `invoice.after_signature` output),
   issued-not-paid with age buckets (needs AIN-P1-12).
5. Response-time and conversion stats (inquiry→contact time, offer win rate) once the
   task data accumulates.

## 11. Integration map (wheel ↔ existing modules)

| Area | Emits events / is scanned | Gets tasks | Notes |
|---|---|---|---|
| Web inquiries | inquiry created, nextStep chosen | inquiry.call, escalations | Engine unchanged; wheel adds the human follow-through |
| Offers | sent, accepted/rejected, validUntil scan | follow-up, expiry renewal | Owner = offer creator (fallback SALES pool) |
| Projects/execution | signature saved, WO completed, material advance | missing-work, invoice.issue | Material tasks per supplier group arrive with AIN-P2-05 (expectedAt) |
| Invoicing | issue, payment mark (new) | invoice.issue, overdue reminders | Payment fields per AIN-P1-12 on the new invoice collection (AIN-P1-08) |
| Service (future, W5) | ticket intake, maintenance plan scan | visit scheduling, yearly maintenance | Plans generate tasks through the same scheduler |
| Repeat sales (future, W5) | equipment-age scan (from confirmed offer items / snapshots) | SALES upsell task with prefilled context | Same rule mechanism, new scan |
| CRM | — | tasks reference clientId (needs AIN-P1-07) | Client page shows open tasks via by-subject |

## 12. Explicit non-goals (v1)

No message broker or external queue; no per-user configurable workflows (config values
only, workflows in code); no mobile push (email + in-app only); no replacement of
existing status fields; no cross-tenant features (tenantId is a constant until T1).
