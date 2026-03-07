# UI Migration Report

- Generated: 2026-03-07T11:14:34.589Z
- Branch: codex/ui-migration-pipeline-v1
- Base SHA: 3051feb
- Selected concept: 3-field-first

## Inventory
- Files scanned: 150
- Modules scanned: 8

## Codemod (settings)
- Mode: apply
- Files changed: 0

## Verification
- Result: FAIL
- settings-build: FAILED
- core-shell-build: FAILED

## Git Status
```text
M apps/module-settings/src/globals.css
 M apps/module-settings/src/index.css
 M package.json
?? apps/module-settings/src/theme.tokens.css
?? tools/
```

## Next Step
- If verify fails, inspect output under `tools/ui-migration/out` and rerun only failed checks.
- If verify passes, commit this step and continue with dashboard module pipeline.
