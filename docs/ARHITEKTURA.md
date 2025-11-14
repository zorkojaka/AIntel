# dY"? Arhitektura aplikacije AIntel

## Modularna zasnova
AIntel je organiziran kot modularni ekosistem, kjer vsak modul vsebuje:
- modele in sheme (`schemas`),
- kontrolerje z logiko,
- routerje za izmenjavo podatkov,
- dokumentacijo, ki predstavi trenutno stanje modula.

## Struktura repozitorija
```
/backend
  ├── core/              # Inicializacija aplikacije, helperji, middleware
  ├── modules/           # Posamezni moduli (dashboard, CRM, itd.)
  ├── db/                # MongoDB povezava in status
  ├── utils/             # Široka zbirka funkcij (normalizeUnicode, dashboard helperji ...)
  ├── routes.ts          # Centralni router, skrbi za vse aktivne module
  ├── server.ts          # Vstopna točka: naloži .env, poveže DB, zažene Express
  ├── package.json       # Odvisnosti in skripte (`npm run dev`, `npm run build`)
  └── tsconfig.json      # TypeScript konfiguracija
```

## Core infrastruktura
- `core/app.ts` sestavi Express aplikacijo, registrira `cors`, JSON parser, `normalizePayload` middleware ter `/health` in modulne rute.
- `core/response.ts` razširi `res` s `success` in `fail`, da je JSON odgovor vedno `{ success, data, error }`.
- `core/errorHandler.ts` poskrbi za globalno obravnavo napak in uporablja `res.fail`.
- `core/middleware/normalizePayload.ts` uporablja `utils/normalizeUnicode.ts`, da normalizira `body`, `query` in `params`.
- `db/mongo.ts` hrani logiko povezave, privzeto `mongodb://127.0.0.1:27017`, iz `.env` pa bere URI in ime baze.

## Health in response standard
- `GET /health` vrača `{ success: true, data: { connected: boolean }, error: null }`, kjer `connected` spremlja status `mongoose.connection.readyState`.
- Če povezava ne uspe, se aplikacija še vedno zažene, `connectToMongo` pa napako zapiše v konzolo; `/health` uporabniku jasno sporoči `false`.

## Dashboard modul
- `modules/dashboard` je prvi aktivni modul: `GET /dashboard/stats` vrne dummy metrike (`users`, `projects`, `activeWidgets`).
- Metrični kontroler uporablja definicijo iz `schemas`, zato novi moduli lahko razširijo isto shemo ali dodajo dodatne widget implementacije.
- Vsak nov modul naj doda `routes/`, `controllers/`, `schemas/` in svoj README, nato pa ga registrira v `routes.ts`.

## Modulna integracija in načrt
- Vsak modul je opisan v `docs/ARHITEKTURA.md`, `docs/MODULES.md` in po potrebi v `docs/faze/<faza>.md` ali v lastnem `modules/<module>/README.md`. Tam zapišemo njegove rute, vezave na baze, podsisteme in kako razširja dashboard widgete ali skupne helperje.
- Dokument `docs/ARHITEKTURA.md` naj vedno vsebuje ključne točke: kje modul sedi v `backend/routes.ts`, katere `core/` helperje uporablja (npr. normalize, response helpers, shared error handling) ter kateri dokumenti (TODO, korespondenca) so povezani z njegovo fazo.
- Centralni načrt aplikacije tako ostane na enem mestu: vsak agent, ki prevzame nov modul, posodobi razdelek o modulu in navede trenutni status, da lahko kdorkoli kadarkoli razume, kako se modul povezuje s sistemom.
- CRM modul (`/crm`) vključuje `people`, `companies`, `notes` rute; uporablja `core/response`, `core/errorHandler` in `utils/normalizeUnicode`. Dokument `docs/faze/01-CRM.md` opisuje uporabniške entitete in testne korake, zato naj vsak agent, ki ga razširja, posodobi ta dokument.
- Dodatna `/crm/clients` podrota upravlja stranke (naziv, tip, DDV, kontakt, oznake, opombe), kar uporablja skupni `ClientForm` komponent; Projects modul uvozi `ClientForm` iz `@aintel/module-crm` in ga odpira pri kliku “Dodaj stranko”.
- Finance modul (`/finance`) hrani `FinanceEntry` zapise v spominu, ponuja `GET /finance`, `POST /finance/addFromInvoice`, `GET /finance/yearly-summary`, `GET /finance/project/:id` in `GET /finance/client/:id`, ter se prikazuje preko `apps/module-finance` z grafi in tabelami. Podrobnosti so zapisane v `backend/modules/finance/README.md` in `05_FINANCE.md`.

  - Cenik modul (`/cenik`) hrani artikle in storitve v `backend/modules/cenik`: `product.model.ts` definira slovenska polja, `controllers/cenik.controller.ts` vodi CRUD logiko, `routes/cenik.routes.ts` je registriran v `backend/routes.ts`, `README.md` pa razloži razširitve in povezave z `docs/03_CENIK.md`. Modul je zaključen (Seed skripta, dokumentacija, dashboard neobvezno).
  - `apps/module-cenik` eksponira `CenikPage`, ki naloži `/api/cenik/products`, prikazuje tabelo, filtre (nov `FilterBar`), modal za urejanje/dodajanje in tailwind utility razrede ter se manifestno poveže s `core-shell` navigacijo.
  - Tailwind in PostCSS konfiguracije (`tailwind.config.ts`, `postcss.config.cjs`) vključujejo `module-cenik`, `docs/faze/03-CENIK.md` pa vodi testne korake in dokumentira integracijo.
  - Settings modul (`/settings`) skrbi za en sam Mongo dokument. `backend/modules/settings` vključuje shemo (`Settings.ts`), servis `settings.service.ts` z helperjem `getSettings()` ter kontroler/rute registrirane v `backend/routes.ts`.
  - `backend/scripts/seed-settings.ts` + `backend/seeds/settings.json` inicializirata privzete podatke, medtem ko `apps/module-settings` nudi stran `/nastavitve` z logotipom, barvno shemo, dokumentnimi prefiksi in PDF predogledom. Modul izvaža `useSettingsData`, kar omogoča CRM in Projektom prikaz kontaktnih podatkov podjetja.



## Frontend monorepo + dizajn sistem
- `apps/core-shell` je glavna frontend aplikacija, ki iz `@aintel/module-crm` prevzema manifest in prikazuje CRM stran z osnovnim `CoreLayout` sidebarjem.
- `apps/module-crm` eksponira CRM manifest, osnovni `CRMPage` in se lahko razširi z novimi komponentami iz `packages/ui`.
- `packages/theme` hrani tokens in `applyTheme()`, ki postavlja `var(--color-...)` vrednosti; `packages/ui` bo vseboval generične komponente (Button, Card, Input, ...).
- CRM stran vsebuje zaposlene obrazce in sezname (osebe, podjetja) z uporabo `DataTable`, `Input` in `Button` iz `packages/ui`, zato novi elementi naj sledijo enotnemu dizajnu.
- Monorepo uporablja `pnpm-workspace.yaml` in `tsconfig.base.json`, da so vsi paketi povezani, razvoj pa omogoča `pnpm --parallel dev`.
