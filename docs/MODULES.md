# AIntel: Modules Directory

Ta mapa vsebuje posamezne funkcionalne module, ki se priklapljajo na core.

## Aktivni moduli

### dashboard/
Prikazuje osnovne metrike o sistemu in že vsebuje strukturo:
- kontrolerje (`controllers/dashboardController.ts`),
- shemo metrike (`schemas/dashboardStats.ts`),
- rute (`routes/index.ts`),
- lasten README (`modules/dashboard/README.md`).
Modul je pripravljen za razširitev: novi moduli lahko dodajo svoje metrike in widgete v dashboard.

### crm/
Vodi kontakte, podjetja in interakcije; že vsebuje:
- sheme `Person`, `Company`, `Note` v `modules/crm/schemas/`.
- kontrolerje in rute za `people`, `companies` in `notes`.
- dokumentacijo v `modules/crm/README.md`.
Modul se poveže na core preko `/crm` (v `backend/routes.ts`) in uporablja globalni response/error standard.

### projects/
Skrbi za lifecycle projektov in povezane dokumente.
- `backend/modules/projects` hrani `ProjectDetail` shemo, kontroler `projectController.ts` ter rute (`GET/POST /projects`, `GET /projects/:id`, `POST /projects/:id/confirm-phase`, `GET /projects/:id/timeline`).
- Frontend `apps/module-projects` uporablja te API-je za seznam, ustvarjanje novih projektov in potrjevanje faz preko gumba "Potrdi ponudbo"/"Potrdi prevzem".
- Modul je registriran v `backend/routes.ts` kot `/projects`, UI pa je povezan v `apps/core-shell` preko manifestov.

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
4. Dodaj test ali dummy podatke (če je možno)
5. Registriraj `modules/<module>/routes` v `backend/routes.ts`, da je modul dosegljiv preko API-ja
6. Če je vizualna komponenta, pripravi widget za dashboard
