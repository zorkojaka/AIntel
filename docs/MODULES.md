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

### cenik/
Cenik modul hrani artikle/storitve po navodilih iz `03_CENIK.md`. V `backend/modules/cenik` so:
- `product.model.ts`, ki definira ime, kategorijo, nabavno/prodajno ceno in razne opise/proizvajalce/dobavitelje.
- `controllers/cenik.controller.ts`, ki upravlja CRUD operacije z `res.success`/`res.fail` odzivi.
- `routes/cenik.routes.ts`, ki je registriran v `backend/routes.ts` pod `/cenik`.
- `README.md`, ki pove, kako razsiriti shemo ali dashboard metrike.
Frontend je v `apps/module-cenik`: `CenikPage` prikazuje tabelo izdelkov, filtre, obrazec, uporablja `@aintel/ui` komponente in tailwind utility razrede iz `styles.css/globals.css`. Core shell vključuje manifest ter novo navigacijo, `docs/faze/03-CENIK.md` pa vodi testne korake.

## Navodila za nove module
1. Ustvari novo mapo v `modules/`
2. Dodaj `routes/`, `controllers/`, `schemas/` po potrebi
3. Posodobi `ARHITEKTURA.md` z opisom modula
4. Dodaj test ali dummy podatke (ce je mozno)
5. Registriraj `modules/<module>/routes` v `backend/routes.ts`, da je modul dosegljiv preko API-ja
6. Ce je vizualna komponenta, pripravi widget za dashboard

