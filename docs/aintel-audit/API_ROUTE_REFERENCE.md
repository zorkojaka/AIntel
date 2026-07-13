# API Route Reference

Generated/verified from `backend/core/app.ts`, `backend/routes.ts`, and
`backend/modules/**/routes*.ts` on branch `codex/web-inquiries-intake` (2026-07-07).
This is an orientation reference; source code remains authoritative.

Regenerate/check with:

```bash
rg -n "\\b(router|internalRouter)\\.(get|post|put|patch|delete)\\(" backend/modules backend/routes.ts backend/core/app.ts -g '*.ts'
rg -n "router\\.use\\(|app\\.use\\(" backend/core/app.ts backend/routes.ts backend/modules -g '*.ts'
```

## Global Mounts

| Mount | Auth/Gate | Notes |
|---|---|---|
| `GET /health`, `GET /api/health` | public | Mongo connection health only. |
| `/api/public/*` | X-API-Key | Mounted before global CORS/cookie auth. Browser endpoints use `AINTEL_WEB_INQUIRY_API_KEY`; `/clients/*` uses `AINTEL_INTERNAL_API_KEY`. |
| `/api/auth/*` | mixed public/session | Login/reset public; `/me` and `/invite` add auth/role gates in auth router. |
| `GET /uploads/*` | cookie auth | Authenticated legacy upload streaming. |
| `/api/*` | cookie auth | Everything below `backend/routes.ts` requires `requireAuth`; some mounts add role gates. |

## `/api/public`

Browser key routes:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/public/options` | Widget options/settings summary. |
| `GET` | `/api/public/products` | Cached public product groups. |
| `POST` | `/api/public/inquiries` | Public inquiry intake; writes lead/project/offer flow. |
| `POST` | `/api/public/inquiries/:id/photos` | Public inquiry photo upload. |
| `POST` | `/api/public/inquiries/:id/next-step` | Customer next-step choice. |
| `GET` | `/api/public/reviews` | Approved public reviews. |
| `GET` | `/api/public/reviews/by-token/:token` | Review token read. |
| `POST` | `/api/public/reviews/by-token/:token` | Review token submit. |

Internal key routes:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/public/clients/equipment` | Portal equipment by `clientId` or email fallback. |
| `GET` | `/api/public/clients/inquiries` | Portal inquiry/offer summaries by `clientId` or email fallback. |

## Auth And Identity

| Method | Route | Gate |
|---|---|---|
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/logout` | public |
| `GET` | `/api/auth/me` | auth |
| `POST` | `/api/auth/invite` | auth + ADMIN |
| `POST` | `/api/auth/accept-invite` | public |
| `POST` | `/api/auth/request-password-reset` | public |
| `POST` | `/api/auth/reset-password` | public |
| `GET` | `/api/users`, `/api/users/*` mutators | auth + ADMIN mount |
| `GET/POST/PATCH/DELETE` | `/api/employees/*` | auth + ADMIN mount |
| `GET/POST/PATCH` | `/api/employee-profiles/*` | auth + ADMIN mount |
| `GET` | `/api/profile/me`, `/api/profile/my-*` | auth |

## Core Business Mounts

| Mount | Gate | Main routes |
|---|---|---|
| `/api/projects` | auth; route-level project/work-order guards | Project CRUD, assignments/lifecycle/status, offer versions/templates/PDF/send/confirm, logistics, work orders, material orders, invoices, signature, communication feed/messages/review link. |
| `/api/offers` | auth | Offer PDF preview and offer import parse. |
| `/api/zahteve` | auth; write guard on mutators | Requirement CRUD, continue-to-offer, and recommendation endpoints. |
| `/api/cenik` | auth + ADMIN/SALES/FINANCE | Product CRUD and product-service links. |
| `/api/cenik/category-settings` | auth + ADMIN/ORGANIZER | Category settings bulk/update/stats refresh. |
| `/api/price-list` | auth + ADMIN/SALES/FINANCE | Price-list item search. |
| `/api/finance` | auth; company routes ADMIN/FINANCE, self earnings route scoped | Company finance analytics/snapshots/invoices, installer self earnings, payment patch. |
| `/api/settings` | auth; write subroutes ADMIN where enforced | Company settings, PDF company/document settings. |
| `/api/settings/communication` | auth; writes ADMIN | SMTP/communication settings, health, templates CRUD. |
| `/api/crm` | auth | People, companies, notes, and clients CRUD. |
| `/api/web-inquiries` | auth + ADMIN/SALES mount | Admin settings, inquiry list, review moderation. |

## Supporting Mounts

| Mount | Gate | Main routes |
|---|---|---|
| `/api/dashboard` | auth | Stats and installer dashboard. |
| `/api/categories` | auth | Category list, project options, create. |
| `/api/requirement-templates` | auth | Requirement templates CRUD, variants, offer rules CRUD. |
| `/api/execution-rules` | auth; writes ADMIN/ORGANIZER in controller | Rule read/update and suggestions. |
| `/api/files` | auth | Generic file upload/delete. |
| `/api/photos` | auth | Photo upload/list/file/delete. |
| `/api/admin` | auth + ADMIN mount | Product import/audit/export/merge utilities. |

## Role-Gate Notes

- `ADMIN` bypasses `requireRoles`.
- `/api/public` does not use cookie auth; it relies on scoped API keys.
- `/api/finance/my/earnings` is the installer self route; company finance routes are
  ADMIN/FINANCE.
- `/api/employees`, `/api/users`, `/api/employee-profiles`, and `/api/admin` are
  mount-gated to ADMIN.
- `/api/projects` and `/api/zahteve` use route-level guards for write/preparation/
  execution behavior; see module docs for business semantics.
