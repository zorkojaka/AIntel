# UI Migration Pipeline (v1)

This pipeline automates a safe first migration step for the `settings` module.

## Goals

- Scan current frontend state (`inventory`)
- Apply design-token bridge safely (`codemod-settings`)
- Verify build health (`verify`)
- Produce a human-readable change log (`report`)

## Safety

- Work only on a dedicated branch (never on `main`)
- Keep backups in `tools/ui-migration/backups/<timestamp>/...`
- Avoid backend and API contract edits
- Stop after each module and verify

## Commands

```bash
pnpm ui:migrate:inventory
pnpm ui:migrate:settings:dry
pnpm ui:migrate:settings:apply
pnpm ui:migrate:verify
pnpm ui:migrate:report
pnpm ui:migrate:settings
```

## Outputs

- `tools/ui-migration/out/latest-inventory.json`
- `tools/ui-migration/out/latest-codemod-settings.json`
- `tools/ui-migration/out/latest-verify.json`
- `tools/ui-migration/MIGRATION_REPORT.md`
