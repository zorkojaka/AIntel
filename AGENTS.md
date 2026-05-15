# AIntel Agent Rules

AIntel is a real internal business application for Inteligent d.o.o.
Do not treat it as a demo project.

Core rules:
- Backend is the source of truth.
- Frontend must not infer business logic.
- Do not change pricing, VAT, discounts, invoice totals, signatures, or project status logic unless explicitly instructed.
- Do not refactor working code for style.
- Keep changes minimal and domain-scoped.
- Do not cross module boundaries without explaining why.
- Preserve UTF-8 and Slovenian characters.
- Do not edit env files, production deploy files, or database migrations unless explicitly instructed.
- Every task must end with:
  DONE:
  - changed files
  - summary
  - edge cases
  - limitations
  - build/test result