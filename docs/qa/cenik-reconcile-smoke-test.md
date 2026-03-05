# Cenik Reconcile Smoke Test

## Scope
Validate one-time cenik reconcile script for duplicates/missing items against snapshots.

## Preconditions
- `.env` points to target MongoDB (`MONGO_URI`, `MONGO_DB`).
- Snapshots are up to date:
- `backend/data/cenik/aa_api_produkti.json`
- `backend/data/cenik/custom_storitve.json`

## 1) Dry run
Run:

```bash
pnpm --filter aintel-backend exec ts-node scripts/reconcile-cenik.ts
```

Expected:
- No DB writes.
- Report file created in `docs/cenik/reconcile-report-<timestamp>.md`.
- Console prints per-source summary (`snapshot`, `updated`, `created`, `duplicatesMerged`, `missingAfter`, `conflicts`).

## 2) Inspect report
Open latest report and check:
- `Mode: DRY RUN`.
- `Missing after` ideally `0`.
- `Conflicts Requiring Manual Review` section.
- Merge sample lists canonical id + merged ids.

## 3) Confirm run
Run:

```bash
pnpm --filter aintel-backend exec ts-node scripts/reconcile-cenik.ts --confirm
```

Expected:
- Writes applied.
- New report created with `Mode: CONFIRM`.
- Duplicates are not deleted; they are marked inactive (`isActive=false`) and tagged with `mergedInto`.

## 4) Audit and verify
Run:

```bash
pnpm --filter aintel-backend db:audit-products
```

Check in output:
- Duplicate groups by `externalKey` should be `0` (or reduced to expected zero).
- Missing critical fields do not spike.

## 5) UI sanity check
- Open Cenik UI.
- Trigger `Uvoz produktov` -> `Preveri cenik (Audit)`.
- Counts by source should look sane (`aa_api`, `services_sheet`).

## Notes
- Script never deletes documents.
- Default mode is safe dry-run.
- Normal operations after one-time reconcile remain:

```bash
pnpm --filter aintel-backend db:sync-all
```
