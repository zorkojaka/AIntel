# FAZA 1.2 – CRM UI + Core Shell + Dizajn infrastruktura

## Cilj
Vzpostaviti pnpm monorepo z aplikacijama (`core-shell`, `module-crm`) ter skupnimi paketi (`theme`, `ui`, …), da se CRM UI lahko razvija v enem sistemu z doslednim dizajnom.

## Napredek
- [x] Monorepo konfiguracija (root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `apps/`, `packages/`).
- [x] `packages/theme` z dizajn tokeni, `styles.css` in `applyTheme()` helperjem, ki uvaja `var(--color-...)` kot vir resnic.
- [x] `packages/ui` z generičnimi komponentami (Button, Input, Card, DataTable), testi in osnovnimi storyji.
- [x] `apps/core-shell` layout + menu + manifest modulov.
- [x] `apps/module-crm` CRM forme/seznami + navodila za nadaljnje korake.
## Naslednji koraki
1. Dokumentiraj CRM forme v `apps/module-crm` (opis komponent, povezava na UI knjižnico).
2. Nadgradi `packages/ui` z daljšimi komponentami (npr. form field wrapper, modal).

## Testni checkpoints
1. `pnpm install` + `pnpm --filter @aintel/core-shell dev` zaženeta okolje.
2. `@aintel/theme` var-okens uporabljen v `core-shell` in `module-crm`.
3. `docs/KOORDINACIJA.md` dokumentira frontend fazo in GitHub zahteve.
