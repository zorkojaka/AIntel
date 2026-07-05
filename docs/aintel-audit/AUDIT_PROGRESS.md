# Audit Progress

Last updated: 2026-07-05
Last reviewed commit: `c0afad8f92320ba48eddfcaec7a5b52d859c7b2e` (branch `codex/web-inquiries-intake`)

This file lets another agent resume without repeating completed work. Update it after
every meaningful audit step. See DOCUMENTATION_MAINTENANCE.md for the rules.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Orientation and inventory | ✅ Complete |
| 2 | Architecture and shared foundations | ✅ Complete |
| 3 | Backend modules | ✅ Complete (core deep, small modules grouped) |
| 4 | Frontend modules and user flows | ✅ Complete (module-projects deep, others surveyed) |
| 5 | Related applications and integrations | ✅ Complete (boundary depth) |
| 6 | Product and modularization analysis | ✅ Complete |
| 7 | Prioritization and handoff | ✅ Complete |

Full audit documentation set produced in `docs/aintel-audit/`. All required documents
exist. `npx tsc --noEmit` in backend = exit 0 at this commit.

## Depth of review by area

- **Deep (read schemas + routes + controller/service structure)**: core framework
  (app/server/mongo/auth/roles/tenant/response/error), projects (schemas, routes,
  controller function inventory, offer/work-order/material schemas), cenik (product
  model + routes + sync layout), communication (service surface + routes),
  web-inquiries (public + admin + service), finance (routes + snapshot dependency),
  zahteve (model + routes), settings, crm (schemas + routes), auth module.
- **Survey (purpose + routes + sizes, internals sampled)**: admin, dashboard,
  categories, requirement-templates, execution-rules, reviews, photos, files, users,
  employees, employee-profiles, profile; frontend module-projects (structure + file
  sizes, key components identified), core-shell (deep), other frontend modules,
  packages/ui+theme, shared/types+utils.
- **Boundary depth**: inteligent-si (widget config, public key exposure, deploy
  relationship), inteligent-portal (server.js, equipment API consumption, separate DB).

## Confirmed key facts (evidence in the topic docs)

- 22 backend modules, 10 frontend apps, 35 schema/model files.
- Modular monolith; compile-time module registry in core-shell App.tsx.
- Auth: JWT cookie, roles on Employee (User fallback), ADMIN bypasses requireRoles.
- `/api/public` mounted pre-CORS/auth, single shared X-API-Key (published in website
  HTML) — Critical exposure S1.
- Finance & settings mounts have no role gate (verified in route files) — S4.
- `x-tenant-id`/`x-user-id` trusted from client; frontend actively sends x-tenant-id
  via buildTenantHeaders — S3 (Confirmed).
- No scheduler/cron (crontab empty); no backend tests; console-only logging.
- Prod `aintel` PM2 restarts = 58,165 (script path confirmed `dist/backend/server.js`).
- Live prod error confirmed in logs: installer-prep ObjectId('undefined') cast (TD-B7).
- autoIndex:false in db/mongo.ts.
- Prod/staging share db `inteligent`.

## Unresolved questions / assumptions requiring verification

1. **PM2 58k restarts root cause** (AIN-P0-04) — not investigated beyond count + one
   error signature; check pm2 log history + deploy frequency.
2. **Atlas actual indexes** — only schema declarations reviewed; DB not queried.
3. **Header-trust exploitable data exposure** — pattern confirmed; per-endpoint blast
   radius not exhaustively enumerated.
4. **Finance addFromInvoice vs automatic snapshot** — two write paths; which the UI
   uses is unconfirmed.
5. **Email template escaping** of customer-controlled values (S8).
6. **Accounting/fiscalization** — none in code; how accounting receives data unknown.
7. **CRM people/companies vs clients** actual usage (D6); dashboard data sources (D7);
   components/ui vs packages/ui overlap (D9).
8. **Storage path traversal** on entityId (storage-group doc) — needs explicit check.
9. **Repo secret scan** not performed.
10. **Backup/restore** procedure for Atlas + /var/www/aintel/uploads unknown.
11. **nginx** `dev.inteligent.si/aintel-api` proxy config not inspected.
12. **zahteve v6 migration** version tracking mechanism.

## Recommended next steps

The audit is complete. Follow-ups, in order:
1. Resolve the "needs verification" list above (start with AIN-P0-04, secret scan).
2. Execute MASTER_BACKLOG P0 items.
3. Keep this file + the matrix in DOCUMENTATION_MAINTENANCE.md current as code changes.
