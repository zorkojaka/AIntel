# Frontend: core-shell and remaining modules

Reviewed at `c0afad8` — depth: core-shell deep, others survey.

## core-shell (827)
Auth pages (Login, ResetRequest, ResetPassword), `AuthContext`, `CoreLayout` sidebar,
static module registry: manifests imported at compile time, `moduleRoleMap` filters
nav by role (UI-only enforcement — backend gates remain authoritative). Path-prefix
routing, no react-router (TD-F3). Adding a module = editing App.tsx (no dynamic
loading) — acceptable now, relevant to productization (module activation concept in
MODULARIZATION_PLAN). Auth API parsing uses shared `parseApiEnvelope` while
preserving the non-JSON backend proxy guard (AIN-P3-02 foundation).

## module-settings (4,661)
Company settings, logo/color, document prefixes, PDF settings preview, communication
settings/templates UI. Second-largest frontend package — settings UI outweighs several
backend modules; check for dead panels when config consolidates. Its central API file
now uses the shared `parseApiEnvelope` helper (AIN-P3-02 foundation).

## module-cenik (3,744)
Price list table, filters, product form, import UI, category settings. Standard
cenik API helpers use shared `parseApiEnvelope`; the manual duplicate precheck keeps
its explicit 409 envelope read because it needs conflict `data` (AIN-P3-02
foundation).

## module-dashboard (1,533)
Installer dashboard UI backed by `/api/dashboard/installer` live Project,
MaterialOrder, and WorkOrder queries. Legacy `/api/dashboard/stats` remains static
default metrics and is not the active SPA data source. Dashboard API parsing uses
shared `parseApiEnvelope` (AIN-P3-02 foundation).

## module-finance (1,347) / module-employees (1,329) / module-crm (749) / module-profil (560)
Tables/charts for finance; employees+users admin; CRM client list/form only
(`people`/`companies`/`notes` are backend-routed legacy entities, not rendered by
current module-crm); own profile. Module-finance, module-employees, module-crm,
and module-profil API helpers use shared `parseApiEnvelope`; employees form
service-rate API parsing is also on the shared helper (AIN-P3-02 foundation).

## packages/ui + packages/theme
Button, Card, DataTable, Input, Textarea, FileUpload, PhotoManager,
CategoryMultiSelect, ColorPicker, TableRowActions; the only tested code in the repo
(4 component tests). Theme tokens + applyTheme(). `apps/module-projects` also has a
local shadcn-style `src/components/ui` set used by the project workspace, while other
modules import the shared `@aintel/ui` package.

## shared/types + shared/utils
De-facto API contract (offers, logistics, communication, project, roles, …) imported
by backend and frontend — keep this discipline; it is the future module-boundary
contract layer. Note stray compiled `project.js` (D8). AIN-P2-09 removed the shared
`buildTenantHeaders` export and module-projects no longer sends client-supplied
tenant/actor headers.

Confidence: High for shell; others Probable (purpose clear, internals unread).
