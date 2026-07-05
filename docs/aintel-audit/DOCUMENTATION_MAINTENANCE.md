# Documentation Maintenance

How `docs/aintel-audit/` stays true. Rule of thumb: **if a change would make a
sentence in these docs false, that sentence must be updated in the same PR.**

## Update matrix — which docs per change type

| Change type | Must update | Consider |
|---|---|---|
| New/changed API route | MODULE_CATALOG (mount table note), relevant `modules/*.md` | USER_ROLES (if gated), INTEGRATION_MAP (if public/external) |
| Schema/collection change | DATA_MODEL.md, relevant `modules/*.md` | TECHNICAL_DEBT (retire items), MODULARIZATION_PLAN (if tenancy/keys) |
| New module (backend or frontend) | MODULE_CATALOG + new `modules/<name>.md` | CURRENT_ARCHITECTURE diagram |
| Roles/permissions change | USER_ROLES_AND_PERMISSIONS.md | SECURITY_AND_PRIVACY |
| Auth/public surface/upload change | SECURITY_AND_PRIVACY.md | INTEGRATION_MAP |
| Workflow/status/automation change | CURRENT_USER_FLOWS.md | TARGET_OPERATING_MODEL (mark delivered pieces) |
| External integration | INTEGRATION_MAP.md, SYSTEM_CONTEXT.md | |
| Fixing a debt/dead-code item | TECHNICAL_DEBT / DEAD_AND_DUPLICATED_CODE — mark `RESOLVED (commit …)`, don't delete rows | MASTER_BACKLOG item status |
| Architectural/product decision | DECISIONS.md (new entry; supersede, never edit old) | MODULARIZATION_PLAN, ROADMAP |
| Any audited-area code change | AUDIT_PROGRESS.md "last reviewed commit" for that area | |

## Conventions

- **Status markers**: findings/items get `OPEN` (default), `RESOLVED (commit)`,
  `OBSOLETE (reason)`, `SUPERSEDED by <doc/id>`. Never silently delete — history is
  evidence.
- **Confidence labels** (Confirmed / High confidence / Probable / Needs verification)
  are mandatory for new claims; upgrade labels when verified, citing evidence.
- **Evidence**: file path (+line where stable), commit hash, or command output
  summary. No secrets, no customer data, ever.
- **Module docs ↔ source**: each `modules/<name>.md` header names its source paths;
  when you touch those paths, check the doc.
- Backlog IDs (`AIN-Px-yy`) are permanent; completed items move to a `## Done`
  section at the bottom of MASTER_BACKLOG with landing commit.

## Proposed PR checklist (add to PR template when adopted)

```
- [ ] Docs updated per docs/aintel-audit/DOCUMENTATION_MAINTENANCE.md matrix
- [ ] DECISIONS.md entry added if an architectural choice was made
- [ ] Backlog item referenced (AIN-…) and status updated
- [ ] No secrets/customer data in code, logs, or docs
- [ ] npm run build (backend tsc) green; tests green once they exist
- [ ] DB-writing scripts: dry-run output attached, owner approved (shared prod DB!)
```

## Ownership

- Owner of docs: whoever merges to `main` (today: Jaka). Agents propose updates in
  the same branch as code.
- Quarterly (or before any new major phase): skim EXECUTIVE_SUMMARY + ROADMAP for
  drift; re-run the AUDIT_PROGRESS "unresolved questions" list.

## Marking obsolete legacy docs

`docs/ARHITEKTURA.md`, `docs/MODULES.md`, `docs/30_REALITY.md` predate this audit and
contain stale claims (in-memory storage etc.). When touching them, add a banner:
`> ⚠️ Delno zastarelo — glej docs/aintel-audit/ (2026-07).` Do not delete (project
rule). AIN-P3-08 tracks the cleanup.
