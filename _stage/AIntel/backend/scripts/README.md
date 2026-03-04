# Scripts

## Employee roles migration

Migrates roles from legacy `User` documents into `Employee.roles` when the employee has no roles set.

Command:

```bash
pnpm --filter aintel-backend migrate:employee-roles
```

Notes:
- Idempotent: re-running should report `updated: 0` once roles are copied.
- Only employees with empty or missing `roles` are considered.

## Dev admin bootstrap

Creates or updates a local ADMIN user for dev/testing. Will refuse to run in production.

Required env vars:
- `AINTEL_BOOTSTRAP_ADMIN_EMAIL`
- `AINTEL_BOOTSTRAP_ADMIN_PASSWORD`
- `AINTEL_BOOTSTRAP_ADMIN_EMPLOYEE_NAME` (optional, default `Admin`)
- `AINTEL_TENANT_ID` or `AINTEL_BOOTSTRAP_TENANT_ID` (optional, default `inteligent`)

Command:

```bash
pnpm --filter aintel-backend dev:create-admin
```
