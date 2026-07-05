# Proposed root CLAUDE.md changes

The root `CLAUDE.md` stays concise (it loads into every session). Proposal: add the
few durable, safety-critical facts and one pointer to this documentation. Do **not**
apply without owner approval; this document is the staging area.

## Additions (proposed text, ready to paste)

### 1. Under a new "Kritična varnost okolja" (or "Environment safety") section
```markdown
## Environment safety (critical)
- Production and staging share the SAME Mongo Atlas database (`inteligent`).
  Treat every DB access as production. Never run seeds, migrations, `db:*`/`migrate:*`
  scripts, or tests that write, without explicit approval for that specific run.
- Staging sends real emails — do not trigger send flows casually.
- `/api/public/*` is internet-facing (website widget + portal); changes there are
  security-sensitive.
- `autoIndex` is disabled: adding a Mongoose index does nothing until an explicit
  ensure-indexes run.
```

### 2. Under "Repo structure" or a new "Documentation" section
```markdown
## System documentation
- Architecture, data model, security findings, roadmap and agent-ready backlog live in
  `docs/aintel-audit/` — start with `AGENT_HANDOFF.md`.
- Older docs (`docs/ARHITEKTURA.md`, `docs/MODULES.md`, `docs/30_REALITY.md`) are
  partially stale; `docs/aintel-audit/` wins on conflict.
- After code changes, update docs per `docs/aintel-audit/DOCUMENTATION_MAINTENANCE.md`.
```

### 3. Small corrections to existing content
- "Frontend: React 18 … (micro-frontend architecture)" → modules are compile-time
  packages in one bundle, not runtime micro-frontends. Suggest: "modular monorepo SPA".
- Roles listed as "prodajnik, monter, admin, računovodja, vodstvo" → actual system
  roles are ADMIN, SALES, EXECUTION, FINANCE, ORGANIZER ("vodstvo" has no role today).
- Under "What NOT to do", add: "Do not build new features on the `x-tenant-id` /
  `x-user-id` header pattern — tenant/actor come from the session (`req.context`)."

## Explicitly NOT proposed
- No large architectural prose in CLAUDE.md (belongs in docs/aintel-audit/).
- No process changes to the DONE format (AGENTS.md already owns that).
- No removal of existing rules.
