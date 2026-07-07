# Module Catalog

Status as of commit `c0afad8` (2026-07-05). Sizes are TS/TSX line counts (orientation only).
"Review" column tracks audit depth: `deep` / `survey` / `pending`.

## Backend modules (`backend/modules/`)

| Module | Size | Mounted at | Purpose | Business importance | Reuse potential | Review | Doc |
|---|---|---|---|---|---|---|---|
| projects | 13.1k | `/api/projects` (+ `/api/offers` preview, `/api/settings` pdf) | Central entity: projects, offers, work orders, material orders, execution, signature | Critical | High (core module) | deep | [modules/projects.md](modules/projects.md) |
| cenik | 5.2k | `/api/cenik`, `/api/price-list`, `/api/cenik/category-settings` | Price list: products + services, imports (AA API), category settings, product-service links | Critical | High | deep | [modules/cenik.md](modules/cenik.md) |
| communication | 2.6k | `/api/settings/communication`, `/api/projects/...` (project comms) | Email sending (nodemailer), templates, sender settings, message/event log | High | High | deep | [modules/communication.md](modules/communication.md) |
| finance | 1.8k | `/api/finance` | Finance entries from invoices, yearly summaries, snapshots | High | Medium | deep | [modules/finance.md](modules/finance.md) |
| web-inquiries | 1.7k | `/api/public` (public, X-API-Key) + `/api/web-inquiries` (admin) | Website inquiry intake → lead → project conversion | High | High | deep | [modules/web-inquiries.md](modules/web-inquiries.md) |
| zahteve | 1.2k | `/api/zahteve` | Requirements ("zahteve") captured per project, drive offer content | High | Medium | deep | [modules/zahteve.md](modules/zahteve.md) |
| settings | 0.9k | `/api/settings` | Company settings singleton, document counters/prefixes | High | High (core) | deep | [modules/settings.md](modules/settings.md) |
| profile | 0.6k | `/api/profile` | Logged-in user's own profile | Medium | High (core) | survey | [modules/identity-group.md](modules/identity-group.md) |
| crm | 0.6k | `/api/crm` | People, companies, clients, notes | Critical (thin implementation) | High (core) | deep | [modules/crm.md](modules/crm.md) |
| photos | 0.5k | `/api/photos` | Execution photos (sharp processing) | High | High | survey | [modules/storage-group.md](modules/storage-group.md) |
| admin | 0.5k | `/api/admin` (ADMIN) | Admin utilities | Medium | Medium | survey | [modules/small-modules.md](modules/small-modules.md) |
| employees | 0.5k | `/api/employees` (ADMIN) | Employee records + roles | High | High (core) | survey | [modules/identity-group.md](modules/identity-group.md) |
| execution-rules | 0.5k | `/api/execution-rules` | Rules linking products/categories to execution steps | High | Medium | survey | [modules/small-modules.md](modules/small-modules.md) |
| auth | 0.4k | `/api/auth` (mounted in `core/app.ts`, public) | Login, JWT cookie session, password reset | Critical | High (core) | deep | [modules/identity-group.md](modules/identity-group.md) |
| users | 0.4k | `/api/users` (ADMIN) | User accounts (login identities) | Critical | High (core) | survey | [modules/identity-group.md](modules/identity-group.md) |
| requirement-templates | 0.3k | `/api/requirement-templates` | Templates for requirements + offer rules | Medium | Medium | survey | [modules/small-modules.md](modules/small-modules.md) |
| employee-profiles | 0.3k | `/api/employee-profiles` (ADMIN) | Employee cost/service rates | Medium | Medium | survey | [modules/identity-group.md](modules/identity-group.md) |
| dashboard | 0.2k | `/api/dashboard` | Metrics/widgets (early stage) | Medium | High (core) | survey | [modules/small-modules.md](modules/small-modules.md) |
| reviews | 0.2k | — (service only; called from projects/communication) | Customer review requests, public token submission, Google review redirect | Medium | High | survey | [modules/small-modules.md](modules/small-modules.md) |
| categories | 0.1k | `/api/categories` | Project/product categories | Medium | High (core) | survey | [modules/small-modules.md](modules/small-modules.md) |
| files | 0.2k | `/api/files`, `/uploads/*` (auth) | Generic file upload + authenticated legacy upload reads | Medium | High (core) | survey | [modules/storage-group.md](modules/storage-group.md) |
| shared | <0.1k | — | Shared helpers between modules | — | — | survey | [modules/small-modules.md](modules/small-modules.md) |

## Frontend apps (`apps/`)

| App | Size | Purpose | Backend counterpart | Review | Doc |
|---|---|---|---|---|---|
| module-projects | 27.0k | Project workspace: offers, execution, material, signature, comms | projects, zahteve, communication, photos, execution-rules | deep | [modules/frontend-projects.md](modules/frontend-projects.md) |
| module-settings | 4.7k | Company settings, PDF settings, communication settings UI | settings, communication, projects/pdf | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| module-cenik | 3.7k | Price list UI, imports, category settings | cenik | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| module-dashboard | 1.5k | Dashboard UI | dashboard | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| module-finance | 1.3k | Finance tables/charts | finance | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| module-employees | 1.3k | Employees admin UI | employees, users, employee-profiles | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| core-shell | 0.8k | Shell: auth pages, layout, static module registry, role-based nav | auth | deep | [modules/frontend-others.md](modules/frontend-others.md) |
| module-crm | 0.7k | CRM UI (people/companies/clients) | crm | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| module-profil | 0.6k | Own profile UI | profile | survey | [modules/frontend-others.md](modules/frontend-others.md) |
| web-widget | 1 file (JS) | Embeddable inquiry widget for inteligent.si (`videonadzor-widget.js`) | web-inquiries public API | survey | [modules/web-inquiries.md](modules/web-inquiries.md) |

## Shared packages

| Path | Purpose | Review |
|---|---|---|
| `packages/ui` | Shared UI components (Button, Card, DataTable, …) | survey |
| `packages/theme` | Design tokens, `applyTheme()` | survey |
| `shared/types` | Cross-app TypeScript types | survey |
| `shared/utils` | Cross-app utilities | survey |
| `tools/ui-migration` | One-off UI migration tooling | survey |

## Notes

- Module mounting: all under `/api` behind `requireAuth` (`backend/core/app.ts`), except
  `/api/auth` (public) and `/api/public` (X-API-Key web intake). `/uploads/*` is also
  behind `requireAuth` as a legacy upload read route. Role gates per mount in
  `backend/routes.ts`.
- Route reference: [API_ROUTE_REFERENCE.md](API_ROUTE_REFERENCE.md).
- Frontend modules are compile-time imports into `core-shell` (static registry in
  `App.tsx`), not runtime micro-frontends.
- Review statuses updated as audit proceeds; see `AUDIT_PROGRESS.md`.
