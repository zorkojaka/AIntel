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
