# Module group: identity (auth, users, employees, employee-profiles, profile)

Reviewed at `c0afad8` — depth: deep (auth), survey (rest). Grouped: shared ownership
of "who is working in the system".

## auth (444 lines) — `/api/auth` (mounted in core/app.ts)
Login/logout (JWT cookie `aintel_session`), `me`, ADMIN invite + accept-invite,
password reset request/reset. Tokens: random 32B, SHA-256-hashed at rest, expiry.
`bootstrapAdminUser` on startup only when users collection empty (env-driven).
Gaps: no login rate limiting/lockout, no 2FA, no session revocation (S7).
Quirk: `blockNonPost` typed against DOM Request/Response (TD-B6).

## users (384) — `/api/users` (ADMIN)
Login identities: tenantId, email, passwordHash, status ACTIVE/DISABLED (+legacy
`active` bool — dual field), employeeId link, deletedAt soft delete.

## employees (487) — `/api/employees` (ADMIN)
Person records with roles[] (canonical roles live here first; auth middleware prefers
employee.roles over user.roles). Soft delete. Assignments referenced from projects
(assignedEmployeeIds), work orders, material orders, earnings.

## employee-profiles (348) — `/api/employee-profiles` (ADMIN)
Cost/service rates per employee (feeds finance snapshot earnings — Probable; not fully
traced).

## profile (596) — `/api/profile`
Self-service profile for the logged-in user (auth only — correct).

## Group observations
1. User vs Employee split is sound (login identity vs person), but three collections +
   profile module for ~one small company is heavy; keep, don't merge — it's the right
   shape for multi-tenant later.
2. Duplicate status representations (status + active) — normalize.
3. Roles-on-employee-with-user-fallback is subtle; document as the contract
   (already in USER_ROLES doc).
4. tenantId consistently present here — identity group is the most multi-tenant-ready
   part of the system.
5. employee-profiles ADMIN-only is correct (rates are salary-adjacent); AIN-P0-02 made
   finance company earnings ADMIN/FINANCE-only with a scoped installer self view.

Reuse: all High (this is generic core). Confidence: High.
