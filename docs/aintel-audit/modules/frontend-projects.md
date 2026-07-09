# Frontend: module-projects (apps/module-projects, 27k lines)

Reviewed at `c0afad8` — depth: structure deep, components sampled.

## Entry & structure
- `ProjectsPage.tsx` (921): list/kanban/calendar/filters → `ProjectWorkspace.tsx`
  (1,683) — tabbed workspace per project.
- `components/`: NewProjectDialog (736), OffersTab (3,358), PhaseRibbon,
  ProjectKanban/List/Calendar/Filters, Zahteva/* (pillar requirement forms, incl.
  SekcijaAlarmOprema 468, SekcijaSnemalnik 284), PriceListProductAutocomplete,
  projectPhases.ts (phase derivation — also `shared/utils/deriveProjectPhase.ts`;
  check duplication — Needs verification).
- `domains/`: emerging domain split — core (useProject, useProjectTimeline 496),
  logistics (LogisticsPanel 3,113, ExecutionDefinitionPanel 796, MaterialOrderCard
  730), execution (ExecutionPanel 3,393), closing (InvoiceVersionEditor 600 + hooks),
  communication (compose dialogs per document type 367–813, messages tables).
- `api.ts` + `domains/communication/api.ts`: raw fetch to /api (cookie auth).

## Coverage
This single package implements the UI for: project CRUD, zahteve capture (with photos),
offer building/versions/templates/PDF, sending emails, confirmation, material
preparation, scheduling, execution ticking with time tracking, signature, invoicing,
communication feed. It is the operational cockpit of the company.

## Issues
1. TD-F1: three 3k-line components carry the core business UI; state management is
   local useState/useEffect at scale — highest frontend risk.
2. Compose dialogs per document type are near-copies (mirror of backend send-function
   duplication) — unify.
3. Local shadcn-style `src/components/ui` widgets duplicate some `packages/ui`
   primitives (D9); current usage is module-projects-local, while shared modules use
   `@aintel/ui`.
4. Root-level scratch files (`ExecutionPanel.tsx.bak`, `head_ProjectWorkspace.tsx`)
   from past edits (TD-F4).
5. No tests.

## Strengths
Domain folder structure is the right direction; shared/types keeps payloads typed;
mobile-aware pieces (OfferItemsMobile, mobileTopbar util, mobile smoke-test doc).
The central `api.ts` uses shared `parseApiEnvelope` for envelope parsing
(AIN-P3-02 foundation). Selected project hooks (`useConfirmOffer`,
`useInvoiceVersions`), project load, and price-list autocomplete also use the
shared parser. Timeline/project workspace fetches are partially migrated; broader
workspace raw-fetch migration remains open.

Confidence: High on structure; component internals Probable.
