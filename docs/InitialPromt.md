# Initial Prompt for New Agents

Welcome, new AI agent. Before you do anything else, read the critical repositories and docs so you always work inside the architecture and rules:

1. `README.md` – high-level vision, modular phases, tech stack, and general onboarding notes.
2. `00_CORE.md` – the agent manual for Phase 0 covering response helpers, Unicode normalization, health routes, dashboard expectations, and the shared JSON format.
3. `docs/ARHITEKTURA.md` – architecture overview describing core services, module integrations, and the dashboard contract.
4. `docs/TODO.md` – current work tracker of every phase with items marked done or pending; update it per phase changes.
5. `docs/MODULES.md` – module catalog plus instructions for adding a module or widget.
6. `docs/KOORDINACIJA.md` – coordination log with agent communication protocol, GitHub/commit expectations, and how to document phase handoffs.
7. `docs/faze/*` – each phase doc (e.g., `01-CRM.md`, `01-2-CRM-UI.md`) contains specific tasks, entities, and testing steps for that phase.
8. `backend/` – inspect the core services, db connection, middleware, modules, and the UI+backend contract so you reuse utilities instead of duplicating logic.

After reading these, follow the stated rules (keys in English, user text in Slovene, reuse core/utils, normalize Unicode, centralized docs, etc.). Confirm by documenting in the coordination log (preferably in `docs/KOORDINACIJA.md`) what you read before touching code. If you ever wonder which doc to update, follow the Checklist described in `README.md` and the coordination protocol.
