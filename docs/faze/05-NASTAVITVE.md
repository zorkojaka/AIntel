# FAZA 4: Nastavitve – implementacija

## Povzetek
- ustvarjen je centralni Settings modul na backendu z enoličnim dokumentom in helperjem `getSettings()`
- dodan seed (`backend/seeds/settings.json`) in skripta `pnpm --filter aintel-backend seed:settings`
- zgrajen frontend modul `apps/module-settings` z obrazcem, logotipom, barvno shemo, dokumentnimi prefiksi, PDF predogledom in takojšnjo uporabo nastavitev
- CRM in Projekti preberejo nastavitve prek `useSettingsData` in prikazujejo kontakt podjetja

## Backend
- lokacija: `backend/modules/settings`
  - `Settings.ts` definira shemo z `key: 'global'` ter subdokument `documentPrefix`
  - `settings.service.ts` skrbi za `getSettings()`, `ensureSettingsDocument()` in posodobitve z validacijo
  - `controllers/settings.controller.ts` izpostavi `GET /settings` in `PUT /settings` (obvezna `companyName` + `address`)
  - `routes/settings.routes.ts` je registrirana v `backend/routes.ts` pod `/api/settings`
- seed: `backend/scripts/seed-settings.ts` prebere `backend/seeds/settings.json` in upserta dokument

## Frontend
- nov paket `@aintel/module-settings`
  - `SettingsPage` (ruta `/nastavitve`) vključuje:
    - osnovne podatke podjetja, logotip (upload + preview), primarno barvo, plačilne pogoje, izjavo
    - urejanje dokumentnih prefiksov z `DataTable` pregledom
    - PDF predogled z dummy projektom in sprotnim upoštevanjem izbranih barv/logotipa
  - `useSettingsData` hook skrbi za nalaganje in (po želji) sinhronizacijo teme
  - manifest posreduje navigacijo v core-shell
- `apps/core-shell` posodobljen s Settings modulom (nav + default view)
- `apps/module-crm` in `apps/module-projects` prikazujeta kontaktne podatke podjetja iz nastavitev

## Testni koraki
1. `pnpm --filter aintel-backend seed:settings`
2. `pnpm run dev:stack`
3. v brskalniku odpri `/nastavitve`
   - spremeni email ali barvo, klikni **Shrani nastavitve**
   - preveri, da `PUT /api/settings` vrne `success` in da se PDF predogled takoj posodobi
4. osveži stran → podatki se ponovno naložijo (GET /settings)
5. preveri CRM in Projekti module: v glavi je prikazan naziv, naslov in kontakt podjetja iz nastavitev

## Odprta vprašanja
- morebitne dodatne nastavitve (davčne stopnje, uporabniki) se dodajo v isti dokument
- za produkcijo je smiselno dodati shranjevanje logotipa v datotečni strežnik/S3; trenutno se uporablja base64 data-url
