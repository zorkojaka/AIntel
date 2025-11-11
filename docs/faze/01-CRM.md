# FAZA 1: CRM

## Cilj
Vzpostavitev modula za kontakte, podjetja in opombe, ki je povezan s core backendom, podpira JSON response standard in lahko pošilja metrike v dashboard.

## Vsebina
- `modules/crm/schemas`: `Person`, `Company`, `Note` (glej `docs/01_CRM.md` za polja).
- `modules/crm/controllers`: logika za CRUD operacije (kontakti, podjetja, opombe).
- `modules/crm/routes`: `people`, `companies`, `notes`.
- `modules/crm/README.md`: dokumentacija za agentje, ki želijo razširiti CRM.

## Testni koraki
1. Uporabi `POST /crm/companies` in `POST /crm/people`, da ustvariš osnovne organizacije in kontakte.
2. Vzpostavi povezavo via `company_id` in `notes` ter preveri `GET /crm/companies/:id`.
3. Pobrskaj po `GET /crm/notes/:entityType/:entityId` za opombe.
4. Preveri, da `/dashboard/stats` lahko sprejme razširitve iz CRM (npr. kasneje števec kontaktov).

## Dokumentacija
- Posodobi `docs/ARHITEKTURA.md`, `docs/MODULES.md`, `docs/TODO.md` in `docs/KOORDINACIJA.md` po vsakem večjem napredku.
