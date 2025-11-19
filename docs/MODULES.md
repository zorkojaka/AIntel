# AIntel: Modules Directory

Ta mapa vsebuje posamezne funkcionalne module, ki se priklapljajo na core.

## Aktivni moduli

### dashboard/
Prikazuje osnovne metrike o sistemu in ze vsebuje strukturo:
- kontrolerje (`controllers/dashboardController.ts`),
- shemo metrike (`schemas/dashboardStats.ts`),
- rute (`routes/index.ts`),
- lasten README (`modules/dashboard/README.md`).
Modul je pripravljen za razsiritev: novi moduli lahko dodajo svoje metrike in widgete v dashboard.

### crm/
Vodi kontakte, podjetja in interakcije; ze vsebuje:
- sheme `Person`, `Company`, `Note` v `modules/crm/schemas/`.
- kontrolerje in rute za `people`, `companies` in `notes`.
- dokumentacijo v `modules/crm/README.md`.
Modul se poveze na core preko `/crm` (v `backend/routes.ts`) in uporablja globalni response/error standard.
- `clients` endpoints (GET/POST/PUT/DELETE `/crm/clients`) urejajo stranke (naziv, tip, DDV, kontakt, oznake, opombe); backend preverja DDV za podjetja in preprečuje enak naziv + DDV.
- `@aintel/module-crm` eksponira `ClientForm`, ki uniformno preverja tip stranke, DDV, oznake in opombe; ta komponenta je zdaj ponovno uporabljena iz `apps/module-projects` pri gumbu “Dodaj stranko”.

### projects/
Projekti modul omogoča spremljanje ponudb in logistike:
- `backend/modules/projects` hrani projekte v spominu, `routes/index.ts` registrira `/projects` v `backend/routes.ts`.
- Endpoints: `GET /projects` (povzetki), `GET /projects/:id` (detajli z postavkami, ponudbami, naročilnicami, dobavnicami, timeline), `POST /projects` (nov projekt), `POST /projects/:id/offers` in `POST /projects/:id/offers/:offerId/send|confirm|cancel|select` (upravljanje verzij ponudb), `POST /projects/:id/deliveries/:deliveryId/receive` (potrditev dobave), `POST /projects/:id/status`, `POST /projects/:id/signature`.
- Frontend `apps/module-projects` zdaj prikazuje podatke iz API-ja, gumbi za novo ponudbo, potrditev ponudbe, potrditev dobavnice in podpis projekta posodabljajo backend in `TimelineFeed`.

### cenik/
Cenik modul hrani artikle/storitve po navodilih iz `03_CENIK.md`. V `backend/modules/cenik` so:
- `product.model.ts`, ki definira ime, kategorijo, nabavno/prodajno ceno in razne opise/proizvajalce/dobavitelje.
- `controllers/cenik.controller.ts`, ki upravlja CRUD operacije z `res.success`/`res.fail` odzivi.
- `routes/cenik.routes.ts`, ki je registriran v `backend/routes.ts` pod `/cenik`.
- `README.md`, ki pove, kako razsiriti shemo ali dashboard metrike.
Frontend je v `apps/module-cenik`: `CenikPage` prikazuje tabelo izdelkov, filtre, obrazec, uporablja `@aintel/ui` komponente in tailwind utility razrede iz `styles.css/globals.css`. Core shell vključuje manifest ter novo navigacijo, `docs/faze/03-CENIK.md` pa vodi testne korake.

### settings/
Modul Nastavitve hrani en sam dokument z informacijami o podjetju, oblikovanju in prefiksih dokumentov. Backend (`backend/modules/settings`)
vsebuje `Settings.ts` (Mongoose shema), servis `settings.service.ts` z helperjem `getSettings()` ter kontroler/ruto (`GET/PUT /settings`).
Skripta `pnpm --filter aintel-backend seed:settings` prebere `backend/seeds/settings.json` in inicializira podatke.
Frontend del (`apps/module-settings`) nudi stran `/nastavitve` z obrazci za podjetje, logotip, barvo, plačilne pogoje, dokumentne prefikse
in PDF predogledom. Modul izvaža `useSettingsData`, zato CRM in Projekti prikazujeta kontakt podjetja iz istih nastavitev.

### finance/
Avtomatsko prevzame podatke iz izdanih računov in ponuja agregirane vpoglede.
- model `FinanceEntry` z vzorčnimi zapisi v `modules/finance/schemas/financeEntry.ts`.
- kontroler `financeController.ts` podpira `GET /finance` seznam, `POST /addFromInvoice`, `GET /yearly-summary`, `GET /project/:id`, `GET /client/:id`.
- manifest in UI `apps/module-finance` prikazujeta tabele, grafe in statistične kartice.
Modul je registriran v `backend/routes.ts` pod `/finance` in povezan v `apps/core-shell` kot tretji modul.

## Navodila za nove module
1. Ustvari novo mapo v `modules/`
2. Dodaj `routes/`, `controllers/`, `schemas/` po potrebi
3. Posodobi `ARHITEKTURA.md` z opisom modula
4. Dodaj test ali dummy podatke (ce je mozno)
5. Registriraj `modules/<module>/routes` v `backend/routes.ts`, da je modul dosegljiv preko API-ja
6. Ce je vizualna komponenta, pripravi widget za dashboard

