# Cenik Audit

Generated: 2026-04-27

Scope: read-only discovery of the AIntel price list (`cenik`) backend, import/export paths, frontend management UI, supplier/API connections, and observed data quality.

## Executive Summary

- The cenik stores products and services in one Mongo collection/model: `Product`.
- Services are not a separate model. They are products with `isService: true`, plus optional execution defaults. Product-to-service defaults are stored in `ProductServiceLink`.
- The current unique identifier strategy is based on `externalKey` and, for `aa_api`, a partial unique index on `(externalSource, externalId)`. There is no explicit internal `sifra`/SKU/code field.
- Import exists through JSON snapshots and local pasted/uploaded CSV/TSV rows. There is no real Excel import parser.
- Export of the cenik as CSV/Excel was not found.
- The UI supports manual add/edit/delete, duplicate precheck, import analyze/apply, conflict resolution, duplicate review/merge, audit review, category filters, and service links.
- External supplier API integration is not live in this code. The "AA API" import currently fetches a generated JSON snapshot from GitHub, not Alarm Automatika directly.
- A read-only current DB audit reported 538 total products, 524 active products, 14 inactive/merged products, 489 `aa_api` records, 48 `services_sheet` records, and no duplicate groups detected by the current audit rules.

## A. Current Data Model

### Product / CenikItem

Primary file: `backend/modules/cenik/product.model.ts`

`ProductDocument` fields:

| Field | Type / constraints | Notes |
| --- | --- | --- |
| `externalSource` | string, default `''` | Import/source namespace such as `aa_api`, `services_sheet`, `dodatki`, or manual source. |
| `externalId` | string, default `''` | Source record id. Used with `externalSource` for matching. |
| `externalKey` | string, unique sparse | Usually `${source}:${externalId}`. Main import identity. |
| `ime` | required string | Product/service name. |
| `kategorija` | string, default `''` | Legacy/single category field. Still present, but not the main UI field. |
| `categorySlugs` | string array, default `[]` | Main current category assignment field. Required by create/import flows. |
| `categorySlug` | string, lowercase | Legacy/single slug field. Used by search fallback. |
| `categories` | string array, default `[]` | Legacy/project migration field. Used by search fallback. |
| `purchasePriceWithoutVat` | required number, min 0, default 0 | Purchase price without VAT; often set equal to `nabavnaCena`. |
| `nabavnaCena` | required number, min 0, default 0 | Purchase/cost price. |
| `prodajnaCena` | required number, min 0, default 0 | Sale price. Import requires `> 0`; manual controller normalizes invalid to 0. |
| `kratekOpis` | string | Short description. |
| `dolgOpis` | string | Long description. |
| `povezavaDoSlike` | string | Image URL. |
| `proizvajalec` | string | Manufacturer. |
| `dobavitelj` | string | Supplier. Yes, a supplier field exists. |
| `povezavaDoProdukta` | string | Supplier/product URL. |
| `naslovDobavitelja` | string | Supplier address. |
| `casovnaNorma` | string | Time norm. In imported AA data this may be numeric `0`, but schema stores string. |
| `isService` | boolean, default false | Product/service discriminator. |
| `defaultExecutionMode` | enum `simple`, `per_unit`, `measured` | Service execution default. |
| `defaultInstructionsTemplate` | string | Service execution instruction template. |
| `isActive` | boolean, default true | Soft inactive marker used for merged duplicates. |
| `mergedIntoProductId` | ObjectId ref `Product` | Target product when record is merged. |
| `status` | enum `active`, `merged`, default `active` | Merge status. |
| `createdAt` / `updatedAt` | timestamps | Mongoose timestamps. |

Indexes:

- `externalKey` unique index.
- Partial unique index on `{ externalSource: 1, externalId: 1 }` only when `externalSource: 'aa_api'` and `externalId` is a non-empty string.

### Services vs Products

Products and services share the same model. Differences:

- `isService: false` means material/product.
- `isService: true` means service.
- Services can use `defaultExecutionMode` and `defaultInstructionsTemplate`.
- The frontend has separate views/filters for all cenik, products, and services.
- The service import source is `services_sheet`.
- Product-service default relationships are stored in `ProductServiceLink`, where a non-service product points to a service product.

### ProductServiceLink

Primary file: `backend/modules/cenik/product-service-link.model.ts`

Fields:

| Field | Type / constraints | Notes |
| --- | --- | --- |
| `productId` | ObjectId ref `Product`, required | Source product. Controller requires this product is not a service. |
| `serviceProductId` | ObjectId ref `Product`, required | Linked service. Controller requires this product is a service. |
| `quantityMode` | `same_as_product` or `fixed` | Default `same_as_product`. |
| `fixedQuantity` | number, min 0 | Used only with `quantityMode: fixed`. |
| `isDefault` | boolean, default true | Whether link is default. |
| `sortOrder` | number, default 0 | Ordering. |
| `note` | string | Link note. |
| `createdAt` / `updatedAt` | timestamps | Mongoose timestamps. |

### Import Tracking Models

`ProductImportRun` (`backend/modules/cenik/import-run.model.ts`) tracks import runs:

- `source`, `mode` (`analyze`/`apply`), `startedAt`, `finishedAt`, `triggeredBy`, `status`.
- Source row/action counts: total, matched, create/update/skip/conflict/invalid.
- Applied counts: created, updated, skipped, unresolved conflicts.
- `sourceFingerprint`, `warnings`, `errorSummary`.

`ProductImportConflictResolution` (`backend/modules/cenik/import-conflict-resolution.model.ts`) stores saved conflict decisions:

- `source`, `externalId`, `externalKey`, `rowFingerprint`.
- `action`: `link_existing`, `create_new`, `skip`.
- Optional `targetProductId`.
- Unique index on `{ source, externalKey }`.

### Categories

Category model: `backend/modules/categories/schema.ts`

Fields:

- `name`: required string.
- `slug`: required string, lowercase, unique.
- `color`: optional string.
- `order`: number, default 0.
- timestamps.

Category APIs:

- `GET /api/categories`: list categories from `CategoryModel`.
- `POST /api/categories`: create category.
- `GET /api/categories/project-options`: derives distinct `Product.categorySlugs` from products and humanizes slugs.

Important mismatch: the categories module README still says `Product` should use `categorySlug`, but the current cenik UI and import flow primarily use `categorySlugs`.

## B. Import Methods

### 1. Admin API: `POST /api/admin/import/products/from-git`

Files:

- `backend/modules/admin/routes/admin.routes.ts`
- `backend/modules/admin/controllers/import.controller.ts`
- `backend/modules/cenik/services/product-sync.service.ts`

Auth:

- Mounted under `/api/admin`, protected by `requireRoles([ROLE_ADMIN])`.

Request:

```json
{
  "source": "aa_api | services_sheet | dodatki",
  "mode": "analyze | apply",
  "confirm": true,
  "items": []
}
```

Accepted formats:

- For `aa_api`: remote JSON snapshot from `backend/data/cenik/aa_api_produkti.json`.
- For `services_sheet`: remote JSON snapshot from `backend/data/cenik/custom_storitve.json`.
- For `dodatki`: local JSON array supplied in request body as `items`.
- Remote JSON can be either an array or `{ "products": [...] }`.

Remote source:

- `AINTEL_IMPORT_GIT_BASE_URL` if set.
- Default: `https://raw.githubusercontent.com/zorkojaka/AIntel/main`.
- This is a GitHub raw snapshot fetch, not a direct supplier API call.

Supported source paths:

| Source | Path | Notes |
| --- | --- | --- |
| `aa_api` | `backend/data/cenik/aa_api_produkti.json` | Material/products, supplier defaults to Alarm Automatika. |
| `services_sheet` | `backend/data/cenik/custom_storitve.json` | Services, supplier defaults to Inteligent. |
| `dodatki` | request body `items` only | No remote fetch; intended for local CSV/TSV pasted/uploaded rows. |

Required normalized fields for each row:

- `externalId`: required for `aa_api` and `services_sheet`; generated for `dodatki` if missing.
- `externalSource`: optional, but if present must match `source`.
- `externalKey`: optional, but if present must equal `${source}:${externalId}`.
- `ime`: non-empty string.
- `prodajnaCena`: number `> 0`.
- `nabavnaCena`: number `>= 0`.
- `dobavitelj`: non-empty after defaults.
- `naslovDobavitelja`: non-empty after defaults.
- `isService`: boolean.
- `categorySlugs`: non-empty string array.

Optional mapped fields:

- `kategorija`
- `purchasePriceWithoutVat`
- `kratekOpis`
- `dolgOpis`
- `povezavaDoSlike`
- `povezavaDoProdukta`
- `proizvajalec`
- `casovnaNorma`

Fields written on create/update:

- `externalSource`, `externalId`, `externalKey`, `ime`, `kategorija`, `categorySlugs`, `purchasePriceWithoutVat`, `nabavnaCena`, `prodajnaCena`, `kratekOpis`, `dolgOpis`, `povezavaDoSlike`, `povezavaDoProdukta`, `proizvajalec`, `dobavitelj`, `naslovDobavitelja`, `casovnaNorma`, `isService`, `isActive: true`.

Duplicate and matching behavior:

- Duplicate `externalKey` inside the same input becomes an invalid row.
- Existing DB match priority:
  1. Exact `externalKey`.
  2. Exact `(externalSource, externalId)`.
  3. Strict business key: normalized `ime`, `proizvajalec`, `dobavitelj`, and product/service type.
  4. Stored conflict resolution if `rowFingerprint` still matches.
  5. Name-only matches are conflicts, not automatic creates.
- Multiple DB matches by external key/source id/strict key become conflicts.
- Rows with conflicts or invalid fields are excluded from apply.
- `apply` updates changed fields and creates new rows; it does not deactivate missing source rows.
- A Mongo `import_locks` collection lock prevents concurrent apply per source. The admin controller also has an in-memory per-source lock.

Limitations:

- Endpoint name says `from-git`, and non-`dodatki` imports are coupled to GitHub snapshot files.
- No direct upload parser on backend for CSV, TSV, Excel, or XLSX.
- No field-level import mapping configuration persisted in DB.
- No dry-run diff export/download.
- Missing-source deactivation is not part of the normal sync apply flow.

### 2. Frontend `dodatki` CSV/TSV Import

File: `apps/module-cenik/src/CenikPage.tsx`

Accepted format:

- Pasted rows or uploaded `.csv`/`.tsv` text file.
- Browser parses delimited text into JSON rows and sends them to `POST /api/admin/import/products/from-git` with `source: "dodatki"`.
- Delimiter detection: tab first, then semicolon, otherwise comma.
- Minimal CSV quoting support is implemented client-side.

Mapped headers:

| Input header variants | Backend field |
| --- | --- |
| `externalId` | `externalId` |
| `ime`, `name`, `naziv` | `ime` |
| `categories`, `category`, `categorySlugs`, `kategorije`, `kategorija` | `categorySlugs` |
| `nabavnaCena`, `purchasePrice`, `purchasePriceWithoutVat` | `nabavnaCena` |
| `prodajnaCena`, `salePrice`, `price` | `prodajnaCena` |
| `proizvajalec`, `manufacturer` | `proizvajalec` |
| `dobavitelj`, `supplier` | `dobavitelj` |
| `isService`, `service` | `isService` |
| `kratekOpis`, `shortDescription` | `kratekOpis` |
| `dolgOpis`, `description` | `dolgOpis` |
| `povezavaDoSlike`, `imageUrl` | `povezavaDoSlike` |
| `povezavaDoProdukta`, `productUrl` | `povezavaDoProdukta` |
| `naslovDobavitelja`, `supplierAddress` | `naslovDobavitelja` |
| `casovnaNorma`, `timeNorm` | `casovnaNorma` |

Category cell splitting:

- `categorySlugs` cell is split by `|` or `;`.

Duplicate behavior:

- Same as admin API after browser parsing.
- If `externalId` is omitted for `dodatki`, backend generates a deterministic `generated:` id from name/manufacturer/supplier/type.

Limitations:

- This is not Excel import, only text CSV/TSV.
- Parsing is in the browser, so API clients do not get the same CSV parser unless they reproduce it.
- Header normalization has at least one likely typo: `dolgisopis` maps to `dolgOpis`.
- Unknown headers pass through as normalized keys and are ignored by backend import unless the backend recognizes them.

### 3. Manual Product Create/Update APIs

Files:

- `backend/modules/cenik/routes/cenik.routes.ts`
- `backend/modules/cenik/controllers/cenik.controller.ts`

Routes:

- `GET /api/cenik/products`
- `GET /api/cenik/products/:id`
- `POST /api/cenik/products/precheck`
- `POST /api/cenik/products`
- `PUT /api/cenik/products/:id`
- `DELETE /api/cenik/products/:id`

Accepted format:

- JSON API payload.

Mapped/writable fields:

- `ime`, `categorySlugs`, `isService`, `purchasePriceWithoutVat`, `nabavnaCena`, `prodajnaCena`, `kratekOpis`, `dolgOpis`, `povezavaDoSlike`, `proizvajalec`, `dobavitelj`, `povezavaDoProdukta`, `naslovDobavitelja`, `casovnaNorma`, `defaultExecutionMode`, `defaultInstructionsTemplate`.

Duplicate behavior:

- Create first calls `precheckProductCandidate` unless `allowDuplicateCreate: true`.
- Precheck uses the same external key/source id/strict business/name-only logic.
- If duplicate/conflict is found, create returns HTTP 409 with candidate matches.
- UI offers "Ustvari anyway" to create with `allowDuplicateCreate: true`.

Limitations:

- Manual create/update does not write `externalSource`, `externalId`, or `externalKey` because `buildPayload` omits them.
- Manual price parsing converts invalid or negative values to `0` instead of returning validation errors.
- Manual create requires `ime` and at least one `categorySlugs`, but not supplier/manufacturer.

### 4. CLI Script: `backend/scripts/sync-products.ts`

Backend package scripts:

- `pnpm --filter aintel-backend db:sync-aa`
- `pnpm --filter aintel-backend db:sync-services`
- `pnpm --filter aintel-backend db:sync-all`

Accepted format:

- JSON file with `{ "products": [...] }`.
- Defaults:
  - `aa_api`: `backend/data/cenik/aa_api_produkti.json`
  - `services_sheet`: `backend/data/cenik/custom_storitve.json`
- Custom path via `--input`.
- Source via `--source`.

Behavior:

- Calls `applyProductImportFromItems`.
- Same mapping and duplicate/conflict rules as the admin API.
- Prints summary and samples of conflicts/invalid rows.

Limitations:

- `--confirm` is parsed but does not gate writes; `applyProductImportFromItems` always writes.
- Message says deactivation is not part of full re-sync.

### 5. CLI Script: `backend/scripts/reconcile-cenik.ts`

Accepted format:

- JSON snapshots with `{ "products": [...] }`.
- Sources: `aa_api`, `services_sheet`.

Behavior:

- More aggressive reconciliation than normal import.
- Validates snapshots.
- Matches by external key and normalized name.
- Can update/create/reactivate/remap by name.
- Can deactivate duplicate records by writing inactive/merged state.
- Writes markdown reports to `docs/cenik/reconcile-report-*.md`.
- Dry run by default; writes only with `--confirm`.

Limitations:

- Custom reconciliation path separate from normal import service.
- Does not support `dodatki`.
- Uses its own duplicate/name-remap logic, so behavior differs from admin import.

### 6. CLI Script: `backend/scripts/seed-cenik.ts`

Package script:

- `pnpm --filter aintel-backend seed:cenik`

Accepted format:

- CSV file at repo root: `Cenik___Pripravljena_Struktura.csv`.
- Naive comma-split parser; no quote-aware CSV parsing.

Mapped columns:

- `Ime produkta` -> `ime`
- `Kategorija` -> `kategorija`
- `Nabavna cena` -> `nabavnaCena`
- `Prodajna cena` -> `prodajnaCena`
- `Kratek opis` -> `kratekOpis`
- `Dolg opis` -> `dolgOpis`
- `Povezava do slike` -> `povezavaDoSlike`
- `Proizvajalec` -> `proizvajalec`
- `Dobavitelj` -> `dobavitelj`
- `Povezava do produkta` -> `povezavaDoProdukta`
- `Naslov dobavitelja` -> `naslovDobavitelja`
- `Casovna norma - storitve` -> `casovnaNorma`

Duplicate behavior:

- Upsert by `{ ime: product.ime }`.
- Same name overwrites fields.

Limitations:

- Legacy path. Does not set `categorySlugs`, `external*`, `isService`, active/merged status, or service defaults.
- Naive CSV parsing can break on commas inside quoted text.

### 7. Dangerous Reset Script: `backend/scripts/DANGEROUS_reset_and_import_aa_api_products.ts`

Accepted format:

- JSON snapshot at `backend/data/cenik/aa_api_produkti.json`.
- Requires CLI flag `--i-know-what-im-doing`.

Behavior:

- Validates AA fields strictly.
- Deletes all products with `ProductModel.deleteMany({})`.
- Inserts AA products with `insertMany`.

Limitations:

- Destructive full collection reset.
- AA-only.
- Not part of normal UI flow.

### 8. Audit/Dedupe/Migration Scripts

These are not import entry points, but they alter or inspect cenik data:

- `backend/scripts/audit-products.ts`: read-only audit.
- `backend/scripts/diagnose-aa-api-duplicates.ts`: read-only duplicate diagnostics.
- `backend/scripts/dedupe-aa-api-products.ts`: dangerous dedupe by AA source/external id, replaces references, deletes duplicates.
- `backend/scripts/dedupe-alarm-automatika-products.ts`: dangerous supplier-name dedupe with reference checks.
- `backend/scripts/dedupe-alarm-automatika-products-simple.ts`: dangerous simple delete by exact `ime`.
- `backend/scripts/fix-legacy-products.ts`: updates legacy products.
- `backend/scripts/migrate-product-categories.ts`: migrates category fields.
- `backend/scripts/cleanup-product-category-fields.ts`: cleans category fields.

## C. Export Capabilities

No cenik export functionality was found.

Searched areas:

- `backend/modules/cenik`
- `backend/modules/admin`
- `apps/module-cenik/src`
- route mounts in `backend/routes.ts`
- scripts under `backend/scripts`

Findings:

- No `GET /api/cenik/export` or similar route.
- No CSV/Excel response headers for cenik.
- No frontend download button for cenik.
- No backend dependency for Excel generation/parsing such as `xlsx`.
- Existing export/PDF code belongs to project/offer/material/work-order documents, not the price list.

Current practical export workaround:

- Direct DB query/script would be needed.
- UI does not provide download as CSV/XLSX.

## D. Frontend UI Capabilities

Primary files:

- `apps/module-cenik/src/CenikPage.tsx`
- `apps/module-cenik/src/components/FilterBar.tsx`
- `apps/module-cenik/src/components/ImportConflictReview.tsx`

Current admin/user capabilities in UI:

- View products/services in the cenik.
- Switch catalog view: all cenik, products, services.
- Quick filter all/products/services.
- Search by product name.
- Filter by category.
- Add product or service manually.
- Edit existing product/service manually.
- Delete product/service manually.
- Manage fields: name, prices, descriptions, image URL, product URL, manufacturer, supplier, supplier address, time norm, categories, service flag, execution mode/template.
- For non-service products, manage linked default services through `ProductServiceLink`.
- Manual create duplicate precheck with candidate matches.
- Force-create duplicate with "Ustvari anyway".
- Import modal:
  - choose `AA API (material)`, `Storitve`, or `Dodatki`.
  - analyze import.
  - apply import.
  - preview create/update/skip/conflict/invalid counts and samples.
  - upload/paste CSV/TSV for `dodatki`.
- Review modal:
  - catalog health summary.
  - duplicate candidate list and merge action.
  - import conflict review and resolution (`link_existing`, `create_new`, `skip`).
  - missing field samples with edit buttons.
  - import run history and run details.

Bulk edit:

- No general bulk edit grid or multi-select batch edit was found.
- Bulk actions are limited to imports, duplicate merge/deactivation, and service-link editing within a single product.

## E. External API Connections

### Supplier APIs

No live external supplier API integration was found in the cenik module.

What exists:

- `aa_api` is a source name and appears in data/import logic.
- Import fetches JSON snapshots from GitHub raw content.
- Product records contain `povezavaDoProdukta` and image URLs pointing to Alarm Automatika/B2B resources.
- Default supplier values in `IMPORT_DEFAULTS`:
  - `aa_api`: `Alarm Automatika d.o.o.`, address `Letaliska cesta 32, 1000 Ljubljana`.
  - `services_sheet`: `Inteligent d.o.o.`, address `Agrokombinatska cesta 12, 1000 Ljubljana`.
  - `dodatki`: `Inteligent d.o.o.`, address `Agrokombinatska cesta 12, 1000 Ljubljana`.

No direct use found for:

- Supplier API keys.
- Alarm Automatika API credentials.
- Supplier auth/token flow.
- External `fetch`/`axios` calls inside `backend/modules/cenik`.

External network call in import:

- `backend/modules/admin/controllers/import.controller.ts` uses Node `http`/`https` to fetch raw JSON snapshot files from GitHub.

Environment:

- No repo-root `.env*` files were listed by the shell in this checkout.
- Runtime env loading checks `backend/.env`, repo `.env`, and parent `.env` paths.
- The audit command connected using an existing configured Mongo environment, but no supplier API key was surfaced in the code search.

## F. Identified Problems and Gaps

### Data Identity

- There is no explicit internal `sifra`/SKU/code field separate from supplier identity.
- `externalKey` is the closest unique product identifier, but manual products do not receive one through the manual create controller.
- Search currently uses `kategorija` as `code` fallback before `externalId`, which makes code semantics confusing.
- Unique `(externalSource, externalId)` index is partial for `aa_api` only, not all sources.

### Data Model

- Category fields are fragmented: `kategorija`, `categorySlug`, `categorySlugs`, and `categories` all exist.
- `casovnaNorma` is typed as string in the schema, while imported data may use numeric `0`.
- Supplier is a free-text field, not a normalized supplier entity.
- No dedicated fields for:
  - supplier SKU/code separate from `externalId`;
  - internal SKU/code;
  - unit of measure;
  - VAT rate per item;
  - currency;
  - margin/markup rules;
  - price valid-from/valid-to;
  - last supplier sync timestamp per item;
  - supplier stock/availability/lead time;
  - source row version/hash stored on product;
  - import batch id on product;
  - archived/replaced source products.

### Pricing

- Supplier purchase price and sale price are only current scalar fields (`nabavnaCena`, `purchasePriceWithoutVat`, `prodajnaCena`).
- No price history.
- No support for multiple suppliers per product.
- No explicit VAT-inclusive vs VAT-exclusive sale price model.
- No structured margin calculation or override reason.

### Import System

- The main admin API is named `from-git`, but it also handles local `dodatki`. This makes the contract unclear.
- Import parsing is split: JSON validation is backend-side, CSV/TSV parsing is frontend-side.
- No XLSX/Excel import.
- No persisted import mapping profiles.
- No backend file upload endpoint for price list import.
- `sync-products.ts` parses `--confirm` but applies writes regardless.
- Normal import does not deactivate source records missing from the snapshot.
- `reconcile-cenik.ts` has separate matching/deactivation behavior from normal import, which can surprise operators.
- Saved conflict resolutions are keyed by `{ source, externalKey }`, so a changed source row with same key but different fingerprint is intentionally not reused.

### Export System

- No user-facing export to CSV/XLSX.
- No canonical export schema.
- No export of import/audit results except reconcile script markdown.

### Frontend

- No true bulk edit.
- No visible way to create/edit category definitions from the cenik module.
- No import mapping preview for arbitrary CSV headers beyond the hardcoded browser parser.
- No download of invalid/conflict rows for offline cleanup.

### Current Data Health

Read-only audit command run:

```text
pnpm --filter aintel-backend db:audit-products
```

Observed result:

- Total products: 538.
- Active products: 524.
- Inactive products: 14.
- Merged products: 14.
- Incomplete products: 29.
- Counts by source:
  - empty source: 1.
  - `aa_api`: 489.
  - `services_sheet`: 48.
- Duplicate groups detected by current audit:
  - duplicate `externalKey`: 0.
  - duplicate `(externalSource, externalId)` when no external key: 0.
  - duplicate name/manufacturer/supplier when no external identity: 0.
- Missing required fields detected by current audit: 0 for `ime`, `nabavnaCena`, `prodajnaCena`, `dobavitelj`, `naslovDobavitelja`, `isService`, `categorySlugs`.
- Price anomalies detected by current audit: 0.

Interpretation:

- The current data is not obviously duplicated under the existing audit rules.
- `incompleteProducts: 29` is still reported because the audit's incomplete definition also checks fields such as missing `proizvajalec`, which are not included in `missingFields`.
- One product has an empty source, likely a manual/legacy record.

## G. Recommended Clean Import/Export Approach

### 1. Define a Canonical Cenik Schema

Create a stable import/export contract that is independent of UI labels:

- `internalCode` or `sifra`: stable internal item code.
- `externalSource`: supplier/source namespace.
- `externalId`: supplier/source item id.
- `externalKey`: computed unique key.
- `supplierId` and `supplierName`.
- `supplierSku`.
- `name`.
- `type`: `product` or `service`.
- `categorySlugs`.
- `unit`.
- `purchasePriceWithoutVat`.
- `salePriceWithoutVat` or explicitly named VAT basis.
- `vatRate`.
- `currency`.
- `manufacturer`.
- `shortDescription`, `longDescription`.
- `imageUrl`, `productUrl`.
- `supplierAddress`.
- `timeNorm`.
- service defaults.
- active/merged state.

Keep Slovenian display labels in the UI/export template, but keep machine fields canonical.

### 2. Normalize Suppliers

Introduce a supplier/source configuration layer:

- `Supplier` collection with name, address, code, API/snapshot type, default currency/VAT, and import profile.
- Product stores `supplierId` plus denormalized supplier name only if needed for display.
- Support multiple suppliers later with a `ProductSupplierOffer` collection if needed.

### 3. Consolidate Import Paths

Replace `from-git` with clearer endpoints:

- `POST /api/admin/cenik/import/analyze`
- `POST /api/admin/cenik/import/apply`
- `POST /api/admin/cenik/import/conflicts/:id/resolve`
- `GET /api/admin/cenik/import/runs`

Backend should accept:

- JSON body.
- CSV upload.
- XLSX upload.
- Remote snapshot source by configured supplier/source.

All formats should normalize into the same backend import rows before matching.

### 4. Make Duplicate Strategy Explicit

Recommended match order:

1. Exact `externalKey`.
2. Exact `(supplier/source, supplier SKU/external id)`.
3. Internal `sifra`.
4. Stored mapping from previous import.
5. Strict business key for suggestions only unless user confirms.
6. Name-only matches always manual review.

Persist:

- source row hash on import run rows;
- applied import batch id on product;
- previous/current field values for audit and rollback.

### 5. Add Export

Add user-facing exports:

- CSV export for simple editing.
- XLSX export with friendly column labels, validation hints, and separate sheets:
  - `products`
  - `services`
  - `categories`
  - `suppliers`
  - optional `service_links`
- Export current filtered view from UI.
- Export invalid/conflict rows from an import run.

### 6. Add Price History

Track price changes separately:

- `ProductPriceHistory`: product id, source, old/new purchase price, old/new sale price, currency, valid date, import run id, changed by.
- Keep current fields on `Product` for fast lookup.
- Import should record price deltas even when updating current values.

### 7. Clean Category Model Usage

Choose one product category field:

- Prefer `categorySlugs: string[]`.
- Deprecate or migrate away from `kategorija`, `categorySlug`, and `categories`.
- Update docs and search result `code` fallback so category is not treated like SKU/code.

### 8. Operational Safety

- Make all imports analyze-first.
- Require explicit confirmation with import run id, not just source/mode.
- Add downloadable diff before apply.
- Add rollback/export snapshot per apply run.
- Remove or quarantine dangerous scripts from routine package scripts, or make their names/status very visible.

