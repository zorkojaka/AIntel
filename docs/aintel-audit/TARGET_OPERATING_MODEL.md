# Target Operating Model

**This document is a recommendation, not current state.** It defines how AIntel should
actively guide every participant so each completed step prepares and triggers the next
("turning the AIntel wheel"). Current-state gaps referenced from CURRENT_USER_FLOWS.

## The core mechanism: Task + State machine + Scheduler

Three primitives make every workflow below possible; none exist today:

1. **Task (next action)** — `{ type, subjectRef (project/inquiry/client/invoice…),
   assigneeRole or assigneeId, dueAt, priority, status, createdBy(system|user),
   blockedReason? }`. Every state transition emits or resolves tasks. Inbox per user +
   per role; management sees overdue/aging.
2. **State machine per entity** — allowed transitions, required fields per transition,
   side effects (create tasks, send notifications) declared in one place instead of
   scattered controller mutations (TD-A4).
3. **Scheduler** — one worker (in-process interval is enough to start) that runs:
   due-task reminders, offer expiry, follow-up generation, maintenance generation,
   digest emails.

## Workflow definitions

Format: States → Role → Required fields → Next action → Blockers → Notifications →
SLA → Automation → Done when → Management view.

### 1. Inquiry (web/phone/email)
- States: `new → contacted → qualified → converted | lost(reason)`.
- Role: SALES (auto-assigned round-robin or fixed owner).
- Required: contact, pillar/need, source.
- Next action: task "Pokliči stranko" due **4 delovne ure** after `new`
  (web inquiries with auto-offer: task "Preveri avtomatsko ponudbo + follow-up klic"
  due next business day; nextStep=posvet/ogled creates the matching task immediately).
- Blockers: missing phone → task "pridobi kontakt".
- Notifications: assignee push/email on create; escalation to ADMIN after SLA breach.
- Automation: current auto-offer engine stays; add auto-lost after N contact attempts
  logged, with reason.
- Done when: converted (project link) or lost with reason (feeds statistics).
- Management: inquiries by state/age/source, conversion %, response-time.

### 2. Qualification & site visit (ogled)
- States: `info_needed → visit_scheduled → visit_done → ready_for_offer`.
- Role: SALES; visit may assign EXECUTION senior.
- Required for visit_scheduled: date, address, assignee; visit_done requires zahteva
  updated + photos.
- Automation: visit_done with complete zahteva → auto-generate offer draft
  (offer-from-requirements exists) → task "Preglej in pošlji ponudbo".
- SLA: visit within 5 working days of request.

### 3. Offer & follow-up
- States: `draft → sent → follow_up_1 → follow_up_2 → accepted | rejected(reason) |
  expired`.
- Required for sent: validUntil, payment terms, client email.
- Automation: `sent + 3 days` → task "Follow-up klic" + optional templated email;
  validUntil passed → auto `expired` + task "Obnovi ali zapri"; acceptance via portal
  link (future) or manual.
- Done when accepted (→ triggers §4) or closed with reason.
- Management: pipeline value by state, aging, win rate by source/pillar.

### 4. Confirmation → procurement & preparation
- States (material): `za_narocit → naroceno(expectedAt) → prevzeto → pripravljeno`.
- Role: ORGANIZER owns; tasks per supplier group ("Naroči pri X — 5 postavk").
- Required for naroceno: supplier, expectedAt. **expectedAt is new and essential** —
  enables late-delivery alerts.
- Blockers: missing supplier on items → task to SALES/ORGANIZER.
- Automation: all items pripravljeno + termin set → project auto-moves to execution
  (exists: applyAutomaticPreparationProgression) + installer prep email (exists).
- Management: materials waiting, late deliveries, projects blocked on material.

### 5. Scheduling
- States: `unscheduled → proposed → confirmed_with_customer`.
- Required: scheduledAt, mainInstaller, team; conflict check against other work
  orders (availability endpoint exists — enforce, don't just display).
- Automation: confirmation email/SMS to customer with reply link; reminder T-1 day to
  team and customer.

### 6. Execution & handover
- Largely built (execution units, time tracking, signature). Add:
- Required to complete: all units done or explicitly skipped with note, photos
  attached (min N per location — configurable), customer signature.
- Blockers: unfinished units generate "manjkajoča dela" task, visible to ORGANIZER.
- Automation: signature saved → task FINANCE "Izdaj račun" due 2 working days
  (this single rule closes the biggest revenue leak: signed-but-uninvoiced work).

### 7. Invoicing & payment
- States: `ready → issued → sent → paid | overdue → reminder_1/2 → escalation`.
- Required: issued needs snapshot OK (exists); sent needs email log (exists).
- **New: payment tracking** — dueDate on invoice, manual "mark paid" first (bank
  import later); overdue → task + templated reminder.
- Management: unbilled completed projects, AR aging, DSO.

### 8. Service & maintenance (new module)
- Entities: ServiceTicket (`reported → scheduled → resolved`), MaintenancePlan
  (equipment-based: from confirmed offer items — data already exposed to portal).
- Automation: plan generates yearly task + customer email ("preventivni pregled");
  ticket intake via portal + phone; warranty date from execution completion.
- This module also powers repeat sales: maintenance visit tasks carry upsell
  checklist (disk age, camera generation).

### 9. Repeat sale / upsell
- Automation: rules on installed-equipment age (from finance snapshot / offer items)
  → periodic task for SALES with prefilled context; campaign lists to portal/email.

## Notification policy (global)

- Task assigned → in-app + optional email (user preference).
- SLA breach → assignee, then role fallback, then ADMIN digest.
- Daily digest per role: my tasks due, my blockers, my projects moving today.
- Management weekly digest: pipeline, stuck list, unbilled, AR.

## Completion conditions per project (the wheel's full turn)

A project may close only when: signed confirmation exists, all work orders
completed/cancelled, invoice issued and paid (or written off with reason), review
request sent, maintenance plan created (if applicable). "Zapri projekt" runs this
checklist — anything missing becomes a final task list instead of a silent close.

## Implementation order (matches ROADMAP)

1. Task entity + inbox UI + manual tasks (no automation yet).
2. Scheduler + first three rules: offer follow-up, offer expiry, signed→invoice task.
3. State-machine layer for project/offer/material (wrap existing statuses, don't
   migrate data).
4. Payment tracking on invoices.
5. Service/maintenance module.
