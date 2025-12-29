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
