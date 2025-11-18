# ✅ TODO tracker za agenta

## FAZA 0 – CORE

- [x] Struktura map
- [x] MongoDB povezava + health-check
- [x] Unicode normalizacija (normalizeUnicode.ts)
- [x] JSON response standard + error handler
- [x] Dashboard modul z dummy podatki in dokumentacija modula
- [x] Layout + navigacija (če obstaja frontend)
- [x] Dokumentacija (CORE.md, TODO.md, ARHITEKTURA.md)
- [x] Preverjeno `npm run dev` in `GET /health` (prikazuje `connected: false` brez lokalne Mongo povezave)

## FAZA 1 – CRM
- [x] Definicija entitet (osebe, podjetja, opombe)
- [x] Kontakti, podjetja, opombe (CRUD / API)
- [ ] Povezava s projekti
Please see `docs/faze/01-CRM.md` for the latest checklist and testing hints.

## FAZA 1.2 – CRM UI + Core Shell
- [x] Monorepo + pnpm + tsconfig base
- [x] `packages/theme` z CSS var + applyTheme
- [x] `packages/ui` (komponente + testi)
- [x] `apps/core-shell` layout + manifest
- [x] `apps/module-crm` CRM UI

## FAZA 2 – Projekti
- [x] Upravljanje projektov
- [x] Statusi, časovnice, povezani dokumenti
- [x] API modul `/projects` (GET/POST/timeline/confirm-phase) in povezava z UI
- [x] Gumbi "Nov projekt", "Potrdi ponudbo", "Potrdi prevzem" in "Zaključi" kličejo backend in sinhronizirajo ProjectWorkspace
- [ ] Povezava gumba "Dodaj iz cenika" z modulom Cenik (čaka fazo 3)
- [ ] Dodati logiko za "Nova postavka" / "Uvozi iz verzije" / "Rekalkuliraj" v ItemsTable (trenutno placeholderji)
- [ ] Implementirati dejansko pošiljanje, podvajanje in brisanje ponudb (dropdown v OfferVersionCard)

## FAZA 3 – Cenik
- [x] Artikel, cena, enota, kategorija
- [x] API za uporabo pri ponudbah in računih
- [x] Faza 3 zaključena (backend + frontend + dokumentacija)

## FAZA 4 – Nastavitve
- [x] Centralni Settings model + API (GET/PUT, helper)
- [x] Seed nastavitev in skripta `seed:settings`
- [x] Frontend modul `/nastavitve` z logotipom, barvami, PDF predogledom in integracijo z CRM/Projekti

## FAZA 5 – Finance
- [x] Pregled računov
- [x] Stroški, prihodki, izpis za knjigovodstvo
