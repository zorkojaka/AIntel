# FAZA 6: CRM – Upravljanje s strankami

## Cilj
Po navodilih iz `06_CRM_FINAL.md` vzpostaviti izkušnjo za vnos in urejanje strank (podjetij ali fizičnih oseb) v CRM, pri čemer se ohrani enoten response/error standard ter uporabi nova `ClientForm` komponenta, ki jo lahko podeduje tudi projektni modul.

## Backend
- `backend/modules/crm/schemas/client.ts` definira `CrmClient` shemo (naziv, tip, DDV, kontakt, oznake, opombe) z avtomatsko `createdAt`.
- Kontroler `frontend/modules/crm/controllers/clientController.ts` izpostavi `GET /crm/clients`, `POST /crm/clients`, `GET|PUT|DELETE /crm/clients/:id`.
- POST/PUT preverjata, da ima `company` veljaven `SI12345678` DDV in preprečujeta `naziv + DDV` podvajanja.
- `clients` rute uporabljajo `core/response.ts` ter so registrirane v `backend/modules/crm/routes/index.ts`.

## Frontend
- `ClientForm` (`apps/module-crm/src/components/ClientForm.tsx`) je modalni obrazec z Zod validacijo, pogojnimi polji in tagi; uporablja `@aintel/ui` komponente in je na voljo kot `@aintel/module-crm` export.
- `CRMPage` (`apps/module-crm/src/CRMPage.tsx`) pridobiva `/api/crm/clients`, prikazuje `DataTable` (nova `rowProps` podpora) in odpre modal na kliku vrstice ali gumba "Dodaj stranko".
- Tabela sedaj vključuje stolpec statusa (preverja `isComplete` iz API-ja) z badge-om in checkbox filter "Pokaži samo nepopolne stranke".
- Naslov je razdeljen na `Ulica` / `Pošta`, e-pošta in telefon imajo vsak svoj stolpec, iskalno polje omogoča filtriranje po imenu ali poštni številki, nepopolni vnosi pa imajo ob nazivu klicaj.
- Stilni dodatki (`styles.css`) upravljajo izbokline za modal, vrstice in prazne sezname.

## Integracija z ostalimi moduli
- `apps/module-projects/src/ProjectsPage.tsx` uvozi `ClientForm`, doda gumb “Dodaj stranko” ter ob oddaji kliče `POST /api/crm/clients`, zato lahko projekti uporabljajo skupni obrazec.

## Testni koraki
1. `POST /api/crm/clients` ustvari stranko brez naslova.
2. `POST` zavrne podjetje brez DDV ali z neveljavnim `SI12345678`.
3. `PUT /api/crm/clients/:id` spremeni podatke in vrne posodobljen objekt.
4. Seznam na `GET /api/crm/clients` se osveži po dodajanju/urejanju.
5. V CRM UI klik na vrstico stranke odpre `ClientForm` z napolnjenimi podatki.
6. V Projects modulu gumb "Dodaj stranko" odpre isti obrazec.

## Dokumentacija
- Posodobi `docs/TODO.md`, `docs/ARHITEKTURA.md` in `docs/MODULES.md` s povzetki.
- `docs/KOORDINACIJA.md` beleži fazo in naslednje korake.
