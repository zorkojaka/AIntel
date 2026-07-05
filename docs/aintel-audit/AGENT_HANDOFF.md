# Agent Handoff — Start Here

Concise instructions for future Claude Code / Codex / human developers.

## Safety constraints (non-negotiable)

1. **Production and staging share Mongo db `inteligent`. Every DB access is
   production access.** Do not run seeds, migrations, tests, or scripts that write —
   including `pnpm seed:*`, `db:*`, `migrate:*` scripts in backend/package.json —
   unless the owner explicitly approves that specific run.
2. Never open, print, or copy `.env` files or any secret. The web-inquiry API key is
   additionally considered compromised (see SECURITY S1) — never paste key values.
3. Don't restart PM2 processes, change deploy config, or touch `_stage/` unless asked.
4. Never delete files — move/archive (project rule). Preserve UTF-8/Slovenian text.
5. Follow root `CLAUDE.md` and `AGENTS.md` (task-completion format, no drive-by
   refactors, `npm run build` after backend changes).

## Reading order

1. This file.
2. `README.md` (index) → `SYSTEM_CONTEXT.md` (where things run).
3. `AUDIT_PROGRESS.md` — what's verified, what's open; check "last reviewed commit"
   vs current `git log` — **if many commits landed since `c0afad8`, verify claims
   against code before relying on them.**
4. For your task: `MASTER_BACKLOG.md` item → linked `modules/*.md` → linked
   architecture/data/security docs.

## Locating knowledge

- Which module owns X? → `MODULE_CATALOG.md` (mount table + doc links).
- How data connects → `DATA_MODEL.md`. Roles/gates → `USER_ROLES_AND_PERMISSIONS.md`.
- Cross-app questions (website/portal/email) → `INTEGRATION_MAP.md`.
- Why is it like this? → `DECISIONS.md`.

## Verifying docs against code (do this before large tasks)

- Routes: `backend/routes.ts` + `backend/core/app.ts` are the truth for mounts/gates.
- Schemas: `backend/modules/*/schemas|*.model.ts`.
- Frontend registry: `apps/core-shell/src/App.tsx`.
- Quick drift check: `git log --oneline <last-reviewed-commit>..HEAD -- backend/ apps/`
  and skim messages for your area.

## Selecting work

- Take the lowest-numbered open backlog item unless the owner directs otherwise;
  respect its `Deps`. P0 security items outrank everything.
- Each item lists scope/acceptance/files — treat acceptance criteria as the test.
- If an item conflicts with what you find in code, update the item (evidence!) rather
  than forcing the stale plan; note it in AUDIT_PROGRESS.

## Avoiding re-audits

Do **not** re-scan the whole repo to answer questions this documentation already
answers; spot-verify the specific files you'll change. If you do review a new area in
depth, record it in AUDIT_PROGRESS (area, files, commit) so the next agent inherits it.

## After code changes

- Update docs per `DOCUMENTATION_MAINTENANCE.md` matrix (same branch/PR).
- Backend: `npm run build` (tsc). Run smoke tests once AIN-P1-04 exists.
- End with the DONE format from `AGENTS.md` (files, summary, edge cases, limitations,
  build result).

## Known sharp edges

- `requireRoles`: ADMIN bypasses everything; several mounts intentionally(?) ungated —
  don't "fix" silently, see AIN-P0-02.
- `x-tenant-id`/`x-user-id` headers are trusted (S3) — do not build new features on
  this pattern; use `req.context`.
- `autoIndex:false` — adding a schema index does nothing until an ensure-indexes run.
- Legacy embedded arrays on Project still have live write paths (D5) — don't extend
  them; new work targets OfferVersion/WorkOrder/MaterialOrder collections.
- Public `/api/public` router bypasses global CORS/auth — anything added there is
  internet-facing.
