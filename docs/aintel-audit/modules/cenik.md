# Module: cenik (backend) + module-cenik (frontend)

Reviewed at `c0afad8` — depth: deep (backend structure), survey (frontend).

## Purpose
Unified price list: products **and** services (single `products` collection with
`isService`), category settings, product→service auto-link rules, supplier imports.

## Users/roles
ADMIN, SALES, FINANCE (mount gate); category-settings: ADMIN, ORGANIZER.

## Surface
- `/api/cenik/products` CRUD + precheck; `/api/cenik/product-service-links` CRUD;
  `/api/price-list/items/search` (typeahead for offers);
  `/api/cenik/category-settings` (+bulk, refresh-stats).
- Admin extensions live in the **admin module**: Excel import/export, git-import,
  duplicate merge, audit (`admin.routes.ts`).
- Sync pipeline `sync/`: aaApiClient (Alarm Automatika), mapper, classifier,
  importDefaults; run via npm scripts from JSON dumps in `backend/data/cenik/`.
- Models: product (see below), category-settings, import-run,
  import-conflict-resolution, product-service-link.

## Product model issues (evidence: `product.model.ts`)
- Mixed-language fields: `ime`, `nabavnaCena`, `prodajnaCena` alongside
  `purchasePriceWithoutVat`; `casovnaNorma` is a **string**.
- Four category fields (P4). Supplier as free text (`dobavitelj`,
  `naslovDobavitelja`) — copied into offer items and material orders downstream.
- `classification` block is CCTV/alarm-specific (camera housing, NVR channels, PoE,
  disk capacity …) — Inteligent-specific vertical baked into the generic model, but
  well-contained in one sub-object; could become a per-vertical extension schema.
- Merge machinery (`mergedIntoProductId`, status merged) + dedupe scripts show a
  history of import duplicate pain (reconcile reports in `docs/cenik/`).

## Dependencies
Consumed by: projects (offer items, work orders, material grouping by supplier),
zahteve (predlogi engine picks recorders/switches/disks by classification),
web-inquiries (auto-offer engine), admin, finance analytics (product frequency).

## Strengths
Import audit trail (import runs + conflict resolutions); precheck endpoint;
classification enables the auto-offer engine — real differentiator.

## Risks / debt
TD-B2, TD-B3 (P4), dangerous scripts (`DANGEROUS_reset_and_import_aa_api_products.ts`)
guarded by flag but present on prod-connected machines; no tenantId; no tests.

## Reuse potential
High as "price list + import framework"; classification must become pluggable
per-vertical config (CORE_VS_CUSTOM §C).

## Confidence
High (models/routes read; controllers surveyed).
