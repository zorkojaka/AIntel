# Module: zahteve (backend)

Reviewed at `c0afad8` — depth: deep (model/routes), High confidence.

## Purpose
Structured requirements ("zahteve") per project: one document with `sistemi[]`
(systems), each typed `videonadzor | wifi_kamere | alarm | domofon | pametna_hisa`,
holding pillar-specific fields, locations and photos; status osnutek/koncana;
execution scenario (posiljanje / izvedba / izvedba_napeljava). Bridge from
information-collection to offer.

## Surface
`/api/zahteve` (auth only): CRUD + `POST /:id/nadaljuj[-na-ponudbo]` (continue to
offer) + suggestion endpoints `predlogi/snemalnik|switch|disk|nosilci` which select
products from cenik `classification` (channels, PoE, disk capacity, brackets).

## Relations
Project.requestIds[] / activeRequestId → Zahteva (real ObjectId refs). Consumed by
offer-from-requirements (projects) and web-inquiries (auto-built zahteve).
Migration scripts `migrate-zahteve-v6.ts`, `migrate-zahteve-execution-cleanup.ts`
indicate active schema evolution. There is no explicit `schemaVersion` /
`migrationVersion` field on the Zahteva schema or frontend type; v6 is inferred by
document shape (`sistemi[]` present and legacy top-level `videonadzor`/`alarm`/
`domofon`/`pametnaHisa` fields absent). `migrate-zahteve-v6.ts` is not exposed in
`backend/package.json`; `migrate-zahteve-execution-cleanup.ts` is exposed as a manual
write script and must not be run from staging while prod/staging share the database.

## Strengths
The predlogi engine (classification-driven recorder/switch/disk/bracket selection) is
the technical heart of auto-quoting; correct location-level granularity that later
feeds execution units (`requirementsLocationUnits` on offer items).

## Problems
- Entirely Inteligent-vertical enums in schema (fine today; extract per-vertical
  config for product).
- tenantId only in service layer, not schema (inconsistent).
- Slovenian status values in DB (TD-B2 family).

## Reuse potential
Pattern reusable ("requirement templates → structured intake → rule-driven offer");
current implementation is vertical-specific.
