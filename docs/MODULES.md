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

## Navodila za nove module
1. Ustvari novo mapo v `modules/`
2. Dodaj `routes/`, `controllers/`, `schemas/` po potrebi
3. Posodobi `ARHITEKTURA.md` z opisom modula
4. Dodaj test ali dummy podatke (če je možno)
5. Registriraj `modules/<module>/routes` v `backend/routes.ts`, da je modul dosegljiv preko API-ja
6. Če je vizualna komponenta, pripravi widget za dashboard
