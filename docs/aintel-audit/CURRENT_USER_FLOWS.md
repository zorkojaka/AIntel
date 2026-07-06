# Current User Flows (as implemented)

Commit `c0afad8`. Mapped against the target lifecycle. Legend: ✅ implemented,
🟡 partial/manual, ❌ missing.

## 1. Lead / inquiry intake

- ✅ **Web inquiry (automated)** — widget on inteligent.si pillar pages →
  `POST /api/public/inquiries` → validation → find-or-create CrmClient (by email) →
  create Project + Zahteva → auto-generate OfferVersion priced from cenik →
  email offer (async) → customer picks next step (avans/posvet/ogled/shrani) via
  public endpoint. Duplicate suppression 10 min per email+pillar. Photos uploadable.
  Evidence: `backend/modules/web-inquiries/*`.
- 🟡 **Manual lead** — sales creates Project via `NewProjectDialog` (module-projects) or
  client via CRM. No "lead" entity distinct from project; no lead source tracking
  besides web inquiries' own records.
- ❌ Phone/email leads have no capture path other than manually creating a project.

## 2. Qualification / follow-up

- 🟡 Web inquiry `nextStep` records the customer's choice, and admin list
  (`/api/web-inquiries`, ADMIN/SALES) shows inquiries + status.
- ❌ No follow-up tasks, reminders, SLA, or "next action" anywhere. An inquiry whose
  customer chose "posvet" (call me) is only visible if someone remembers to look.
  **This is the largest wheel gap: nothing prompts the next actor.**

## 3. Information collection / site visit

- ✅ Zahteve module: per-pillar structured requirement forms (videonadzor, wifi kamere,
  alarm, domofon, pametna hiša) with locations, photos (photos module + PhotoCapture UI),
  execution scenario. `POST /zahteve/:id/nadaljuj` → offer candidates.
- 🟡 Site-visit ("ogled") is only a text option; no scheduling, no visit record.

## 4. Solution design → quotation

- ✅ Offer candidates computed from zahteva (recorder/switch/disk/bracket suggestion
  endpoints `zahteve/predlogi/*`), offer versions with per-item and global discounts,
  dual VAT rates, validity date, PDF export (pdfkit/playwright renderers), templates.
- ✅ Quantity-discount by offer value configurable (commit `c0afad8`).
- 🟡 Pricing depends on cenik hygiene (4 category fields, duplicates — see cenik doc).

## 5. Offer send / follow-up / won-lost

- ✅ Send offer email with template + PDF attachment; messages and events logged per
  project (communication feed).
- 🟡 Offer statuses exist (draft/sent/…/accepted/rejected/expired on legacy embedded;
  OfferVersion.status on collection) but **no automatic expiry**, no follow-up
  scheduling, no lost-reason capture.
- ✅ Confirm offer → `logistics.confirmOffer` generates WorkOrder + MaterialOrder,
  project → priprava.

## 6. Procurement / preparation

- ✅ MaterialOrder per supplier grouping, per-item steps "Za naročiti → Naročeno →
  Za prevzem → Prevzeto → Pripravljeno", pickup method/owner, PDF (naročilnica/
  dobavnica), ORGANIZER role drives `advance` endpoint; readiness gates move project
  to execution automatically (`applyAutomaticPreparationProgression`).
- 🟡 No supplier entity (free-text `dobavitelj`), no PO email to supplier, no expected
  delivery dates → no late-delivery alerts.

## 7. Scheduling

- 🟡 WorkOrder has `scheduledAt` (string) + installer availability check endpoint +
  ProjectCalendar UI; no conflict prevention, no capacity view, no customer
  confirmation loop (only manual "send confirmation" email).

## 8. Execution & evidence

- ✅ Strong: per-item execution with executionUnits per location, per-unit completion
  attribution (who/when), time tracking play/pause events, work logs (hours per
  employee), extra items (`isExtra`), execution note, photos.
- ✅ Work-order confirmation: customer signature versions with resign flow
  (unsigned/signed_active/resign_required), installer preparation email.

## 9. Handover / technical completion

- ✅ Signature capture (`POST /projects/:id/signature`, confirmation versions).
- 🟡 Completion = statuses on work order/project; no handover checklist or document
  pack for the customer beyond signed confirmation.

## 10. Invoicing

- ✅ Invoice versions from closing (create/edit/clone/issue/cancel), document numbering
  via atomic counters, PDF, email send flow, review-request hook (`{{review.link}}`).
- ✅ Issue creates FinanceSnapshot (employee earnings included); failure aborts issue.
- 🟡 `invoiceVersions` stored as `Mixed` on Project — fragile foundation.
- ❌ No fiscal/accounting integration (no FURS fiscalization, no export to accounting
  software found anywhere in backend). Invoice numbering/archive rules therefore
  depend on manual downstream handling. (Confirmed absence in code; business process
  unknown — Needs verification with owner.)

## 11. Payment

- 🟡 Employee earning payment PATCH exists (finance), but **customer payment tracking
  is absent** — no paid/unpaid status on invoices, no payment reminders, no bank
  import. Unbilled/unpaid work is invisible to the system.

## 12. Service & maintenance

- ❌ No service module: no tickets, no warranty tracking, no maintenance contracts, no
  scheduled maintenance. Portal offers self-help guides (napotki) — the only
  service-adjacent feature, and it lives in a separate app/db.

## 13. Repeat sale / upsell

- 🟡 Finance analytics (product frequency, co-occurrence, bundles, same-basket) exist
  as reports; reviews system builds social proof; equipment visibility in portal.
- ❌ Nothing triggers a repeat-sale action (e.g. "camera installed 3 years ago →
  offer disk health check").

## Cross-cutting gaps ("where the wheel stops")

1. **No task/next-action entity** — every handoff (inquiry→call, offer→follow-up,
   material→order, invoice→payment) relies on humans polling lists.
2. **No deadlines/SLA anywhere** (only offer validUntil, unenforced).
3. **Management visibility**: finance analytics + project list/kanban exist, but no
   pipeline-with-aging, no stuck-project report, no unbilled-work report.
4. **Duplicated data entry**: customer data re-entered on project (embedded copy) and
   work order; supplier names typed per item; portal accounts separate from CRM.
5. **Stuck states**: project in `offered` with expired offer; inquiry with nextStep
   `posvet`; material `Naročeno` with no delivery date; work order `completed` but no
   invoice — none of these surface anywhere automatically.
