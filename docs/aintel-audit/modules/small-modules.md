# Small modules: admin, dashboard, categories, requirement-templates, execution-rules, reviews, shared

Reviewed at `c0afad8` — depth: survey each.

## admin (490) — `/api/admin` (ADMIN)
Cenik operations console: product import from git-tracked JSON, Excel
import/export (exceljs, analyze/apply two-phase), duplicate candidates + merge,
cenik audit. Really a cenik sub-module (ownership note in DEAD_AND_DUPLICATED §TD-C3
analog). Keep gate ADMIN. Risky-by-nature endpoints (bulk writes) — candidates for
dry-run defaults and audit logging.

## dashboard (220) — `/api/dashboard`
Two endpoint shapes coexist. `GET /api/dashboard/stats` still returns static default
metrics from `dashboardStats`; the active frontend dashboard uses
`GET /api/dashboard/installer`, which reads live Project, MaterialOrder, and WorkOrder
data scoped to the current employee. The intended management aggregation point remains
minimal; installer workflow visibility is the real implemented path.

## categories (122) — `/api/categories`
Project/product category list (auth only). Overlaps conceptually with cenik
category-settings and product category fields (P4 family). Consolidation candidate.

## requirement-templates (349) — `/api/requirement-templates`
Templates + offer rules driving zahteve forms and offer generation
(`offer-rules.ts`). Small but strategically central for productization: this is where
"configure your vertical" already lives in embryo.

## execution-rules (469) — `/api/execution-rules`
Product/category → execution steps rules; tenant-aware. Same strategic note as above.

## reviews (187) — no own router
Model + service; endpoints spread across web-inquiries public (submit by token,
list approved, Google redirect) and admin routes (moderation), invoked from invoice
flow (`{{review.link}}`) and project completion (commits 896f1ae, 59b1d55; auto-send
behind `reviewAutoRequest` flag, default off). Works, but move routes into the module
for ownership clarity (TD-C3).

## shared (42) — `modules/shared`
`requirements.types.ts` shared between projects and zahteve. Fine.

Reuse: dashboard/categories generic core; requirement-templates + execution-rules are
the seed of the future configuration engine; admin is cenik-specific tooling.
Confidence: High for routes/purpose; internals Probable.
