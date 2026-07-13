# User Roles and Permissions

Commit `c0afad8`. Evidence: `backend/utils/roles.ts`, `backend/middlewares/auth.ts`,
`backend/routes.ts`, `backend/modules/projects/routes/index.ts`,
`apps/core-shell/src/App.tsx`.

## Roles (Confirmed)

Canonical: `ADMIN`, `SALES`, `EXECUTION`, `FINANCE`, `ORGANIZER`.
Aliases normalized in `toCanonicalRole` (technician/ops/manager → EXECUTION;
organizator → ORGANIZER). Roles are stored on **Employee** (preferred) with fallback to
**User** (`middlewares/auth.ts`). CLAUDE.md mentions roles prodajnik/monter/admin/
računovodja/vodstvo — mapping is SALES/EXECUTION/ADMIN/FINANCE/(vodstvo has **no
canonical role**; management visibility is not modeled).

## Enforcement model

1. `requireAuth` (all `/api` except `/api/auth`, `/api/public`): JWT cookie → load User
   (tenant-scoped, not deleted, ACTIVE) → load Employee → roles → `req.context`.
2. `requireRoles([...])` per mount (`routes.ts`) and per route (e.g. projects routes).
   **ADMIN bypasses every requireRoles check** (hardcoded in the middleware).
3. Frontend: `moduleRoleMap` in core-shell App.tsx hides nav/modules by role — UI-level
   only, backend remains the actual gate (correct direction).

### Mount-level gates (routes.ts)

| Mount | Roles |
|---|---|
| /cenik, /price-list | ADMIN, SALES, FINANCE |
| /cenik/category-settings | ADMIN, ORGANIZER |
| /employees, /users, /employee-profiles, /admin | ADMIN |
| /web-inquiries (admin side) | ADMIN, SALES |
| /finance | Company finance endpoints ADMIN, FINANCE; `/my/earnings` and own earning detail scoped server-side for installers |
| /settings | GET auth-only; settings, pdf-settings, communication settings writes ADMIN |
| /dashboard, /crm, /categories, /projects, /requirement-templates, /profile, /offers, /files, /photos, /zahteve, /execution-rules | **auth only, no role gate at mount** |

Projects adds route-level gates: write = ADMIN/SALES/FINANCE; work-order write adds
EXECUTION/ORGANIZER; preparation-only = ORGANIZER; plus payload-shape checks in
`logistics.controller.ts` (`hasPreparationOnly*Payload`) that restrict what EXECUTION
may modify — fine-grained but hand-rolled and easy to drift.

## Findings

1. **RESOLVED (AIN-P0-02): `/settings` writes were open to any authenticated user.**
   Settings, pdf-settings, and communication settings/template writes are now ADMIN
   only; GET routes remain auth-only for dependent modules.
2. **RESOLVED (AIN-P0-02): `/finance` exposed company/payroll-adjacent data to any
   authenticated user.** Company finance endpoints and payment PATCH are now
   ADMIN/FINANCE only; installers use server-scoped `/finance/my/earnings` and own
   earning detail.
3. **`/crm`, `/categories`, `/zahteve`, `/photos`, `/files`, `/execution-rules`
   unrestricted for any authenticated role** — mostly acceptable for a small company,
   but customer PII (CRM) readable by all roles. Medium.
4. **RESOLVED (AIN-P2-09): header-trust in `utils/tenant.ts`**. `resolveTenantId` and
   `resolveActorId` now ignore `x-tenant-id`/`x-user-id` and use server-side session
   context/user fallbacks. Frontend project panels no longer send `buildTenantHeaders`.
   Remaining multi-tenant hardening is AIN-P2-10 tenantId backfill/query scoping.
5. **No permission granularity below role** — no per-project assignment enforcement on
   reads: any SALES/EXECUTION user sees all projects (`listProjects` has no
   assignment filter; installer-scoped filtering exists only in specific preparation
   endpoints — High confidence).
6. **No vodstvo/management role**; FINANCE and ADMIN double as management views.
7. **Session model**: single JWT, 7-day default, no revocation list; disabling a user
   takes effect on next request (requireAuth re-checks user status — good).
8. **Privilege escalation surface**: `/api/users` and `/api/auth/invite` are
   ADMIN-only (correct). Employee role edits ADMIN-only. No path found for a
   non-admin to raise roles (High confidence).

## Multi-company requirements (future)

- Move tenant strictly into session claims; delete header fallbacks.
- Introduce org-scoped roles + a management/reporting role.
- Central policy: today every new route must remember its own gate; a route-registry
  default-deny (or per-module policy map) would prevent gaps like /finance.
- Per-record scoping (installer sees only assigned projects) must become a query-level
  concern, not per-endpoint ad hoc filtering.
