# FAZA 2 – PROJEKTI

## Cilj
Vzpostaviti modul za projekte, ki hrani povezave do CRM strank, spremlja časovnico (ponudba → račun) in izpostavlja API-je za CRUD in potrjevanje faz.

## Backend
- `modules/projekti/models/TimelineEvent.ts` definira faze `offer`, `order`, `workOrder`, `deliveryNote`, `invoice` z `pending/completed` statusom.
- `modules/projekti/models/Project.ts` povezuje `Project` z `CrmCompany`/`CrmPerson`, ureja `notes`, `documents` in vgrajeno časovnico.
- `modules/projekti/controllers/projectController.ts` skrbi za GET/POST/​PATCH/DELETE, izračun zaporedja faz, validacije CRM referenc in `POST /confirm-phase`.
- `modules/projekti/routes/index.ts` zapiše REST API + `/timeline`.
- `backend/routes.ts` registrira `/projekti`.
- `modules/projekti/README.md` opisuje sheme in pogodbe.

## Testiranje
- `npm run test` v `backend/` poganja `backend/tests/projectController.test.ts`, ki preveri privzeto časovnico in logiko potrjevanja faz.
- Za ročno preverjanje: uporabite `GET /projekti`, `POST /projekti`, `POST /projekti/:id/confirm-phase` proti lokalni instanci backend-a.

## Napredek
- [x] Ustvarjene Mongoose sheme + API-ji
- [x] Osnovni testi za časovnico
- [ ] Frontend modul `module-projects`
- [ ] Dokumentni tok in UI časovnica

## Naslednji koraki
1. Implementirati front-end modul (ProjectsPage, ProjectForm, Timeline, manifest in povezava v `core-shell`).
2. Dokončati vizualni prikaz časovnice in gumbov za potrjevanje faz.
3. Posodobiti `docs/TODO.md` in `docs/KOORDINACIJA.md`, ko je UI zaključena faza.
