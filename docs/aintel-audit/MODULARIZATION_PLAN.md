# Modularization Plan

**Recommendation document.** Incremental path from modular monolith to a configurable
multi-company product. No rewrite: the monolith stays deployable at every stage.

## Verdict on feasibility

Incremental refactoring is viable (Confirmed by structure): modules already follow one
skeleton, share one response contract, and `shared/types` gives a contract layer.
The blockers are data-level (identity keys, Mixed fields, embedded legacies, tenant
scope), not framework-level. A rewrite is not justified.

## Target module boundaries & dependency direction

```
verticals (security-systems config)   ← data/config only, no code deps upward
        │
sales ── operations ── billing        ← business modules; may depend on ↓ only
        │
crm ── catalog                        ← domain masters; may depend on ↓ only
        │
platform-core (identity, tenancy, config, tasks/scheduler, communication,
               storage, numbering, audit)
```

Rules: dependencies point downward only; business modules never import each other's
Mongoose models — they call services or subscribe to domain events
(in-process event emitter is sufficient; no message broker needed).

## Configuration model

- Namespaced config store (extend settings module): `config.<module>.<key>`,
  tenant-scoped, typed via zod schemas per namespace, cached with invalidation.
- Absorb over time: web-inquiry settings, pdf-settings, sender settings, category
  settings, execution rules thresholds, review threshold, discount bands, ogled text.
- Vertical definition = data package: requirement templates + validation rules +
  offer-builder rules + classification schema + email templates. Inteligent's
  security-systems vertical becomes the first package (seed data, versioned in repo).

## Tenant / company model

- Stage T0 (now): single tenant, `tenantId='inteligent'` constant.
- Stage T1: tenant strictly from session (kill S3); backfill `tenantId` on all
  business collections (constant value); compound indexes `{tenantId, …}` declared.
- Stage T2: tenant-scoped query layer (mongoose plugin adding tenant filter from
  request context) + tenant-scoped settings/config + per-tenant numbering.
- Stage T3: tenant provisioning (create org, admin invite, vertical package install,
  module activation flags), per-tenant SMTP/sender identity.
- Data isolation: single database with tenantId (chosen for cost/ops simplicity;
  revisit per-tenant DB only if a customer demands it — record in DECISIONS when
  decided).

## Module activation concept

- Backend: routes.ts becomes a registry loop over module descriptors
  `{ name, mount, router, requiredRoles, enabledFor(tenant) }`.
- Frontend: core-shell manifest list filtered by `/api/auth/me` → enabledModules
  (server-driven), replacing the compile-time-only registry (packages still bundled
  together initially — activation ≠ separate deployment).

## Migration stages (each shippable, each reversible)

**Stage 0 — Safety net (prereq)**
Split staging DB from prod; error tracking; smoke tests for the five money flows
(inquiry→offer, offer→confirm, preparation, execution→signature, invoice issue).

**Stage 1 — Data contracts**
`clientId` on Project/WebInquiry (backfill by name + manual review report);
`invoiceVersions` → real collection with schema (read-through during transition);
freeze writes to legacy embedded offers/POs/deliveries (log-then-remove per D4/D5);
expectedAt on material orders.

**Stage 2 — Service extraction (no behavior change)**
Extract logistics controller logic into services (work-order.service,
material.service, confirmation.service); unify the four communication send functions;
single PDF pipeline decision (P6). Characterization tests around each extraction.

**Stage 3 — Platform-core assembly**
Tasks + scheduler (TARGET_OPERATING_MODEL §mechanism); audit log middleware
(who/what/when on mutating routes); unified storage service; config store.
These are new code — low regression risk, immediately valuable to Inteligent.

**Stage 4 — Boundary enforcement**
Replace cross-module model imports with service calls/events module by module
(order: communication↔projects first, then web-inquiries fan-out); ESLint rule
forbidding `../<other-module>/schemas` imports to lock progress in.

**Stage 5 — Tenancy T1→T2** (see above).

**Stage 6 — Vertical extraction**
Pillar enums/builders/classification → vertical package consumed via
requirement-templates + execution-rules engines; English-neutral enum values in DB
with SL display mapping (data migration with dual-read window).

**Stage 7 — First external pilot**
One friendly company, same vertical (another security installer) — exercises tenancy
and config without needing a new vertical package. Only after that, a second vertical.

## Compatibility strategy

- Dual-read/dual-write windows for every data migration; migration scripts are
  versioned, idempotent, and run consciously (never on boot; autoIndex stays off,
  ensure-indexes becomes an explicit deploy step).
- `shared/types` versioned as the API contract; additive changes only within a stage.
- Frontend and backend ship together (monorepo) — no API versioning needed yet.

## Risks

| Risk | Mitigation |
|---|---|
| Migrations on shared prod DB | Stage 0 first; every script dry-run mode + backup point |
| Refactor stalls mid-way (two patterns live) | Small stages; ESLint boundary rule; DEAD_AND_DUPLICATED list tracks retirement |
| Slovenian enum migration breaks UI/emails | Display-mapping layer first, data migration last |
| Solo-maintainer bus factor | This documentation + tests are the mitigation |

## What NOT to separate yet

- Do not split repos or deployables — one monolith, one deploy.
- Do not build a plugin SDK / marketplace — activation flags suffice.
- Do not introduce a message broker or microservices.
- Do not rebuild the portal onto AIntel identity until Stage 5 (email-link auth is
  fine for now; just fix the equipment endpoint key, S1).
- Do not generalize VAT/tax beyond a strategy interface until a non-SI tenant exists.
