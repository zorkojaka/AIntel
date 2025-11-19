# Projektna koordinacija: asinhrono sodelovanje AI agentov

## Cilj
Vzpostaviti transparenten register, kjer lahko več agentov hkrati deluje na lastnih modulih, jasno deli začete in končane korake ter ohranja centralni načrt, da lahko vsakdo kadarkoli nadaljuje ali prilagodi sistem.

## Asinhrona komunikacija
- Vsak agent v `docs/KOORDINACIJA.md` vodi svojo kratko sekcijo `### Agent <ime> – <modul>`, kjer zapiše:
  1. **Začetne naloge** (kaj je prevzel, kateri dokumenti so osnova).
  2. **Izvedeni koraki** (katere rute/sheme je dodal ali posodobil).
  3. **Naslednji koraki** (kaj še ostaja, kateri modul prevzame naslednji agent).
- Dokument služi kot komentiran dnevnik v slovenščini; ključi ostanejo v angleščini. Vsaka sekcija naj referencira `docs/faze/<faza>-<modul>.md` ali `modules/<modul>/README.md`.
- Če agent prejme ločen nabor navodil (npr. že obstaja `docs/faze/01-CRM.md`), naj navede, kje je dokument shranjen in ali je bil posodobljen.

## Modulni register in navodila
- Vsak modul vsebuje `controllers/`, `routes/`, `schemas/` ter `modules/<modul>/README.md`, kjer so opisani API-ji, modeli in opombe glede integracij.
- Za vsako fazo dopolnite `docs/faze/<faza>.md` s strukturirano nalogo in testnim načrtom, nato pa vanjo dodajte povezave tudi v to datoteko.
- Arhitekturo, povezave do `backend/routes.ts` ter uporabljene `core/` helperje opisujemo v `docs/ARHITEKTURA.md`.

## CRM status
- CRM modul teče pod `/crm` (people/companies/notes) in že implementira osnovna CRUD opravila; dodatne naloge evidentirajte v `docs/faze/01-CRM.md`.
- Agent, ki dela na CRM-u, naj doda kratek povzetek v to datoteko, npr. `Agent Ana – CRM: dodani notes endpoint, naslednji kličejo povezavo do projektov`.
- Po vsakem commitu oziroma pushu na https://github.com/zorkojaka/AIntel zabeležite `Commit: FAZA1-CRM - <korak> (branch: <veja>)`.

## Frontend faza 1.2
- `docs/faze/01-2-CRM-UI.md` vodi pnpm monorepo postavitev, `theme` tokens in front-end aplikacije. Vse spremembe v tej fazi zapišite v to datoteko.
- Za vsak commit/push, ki doda frontend infrastrukturo, zapišite `Commit: FAZA1.2-CRM-UI - <korak> (branch: faza/1-2-crm-ui)` in povežite z GitHub repozitorijem.
- CRM komponenta sedaj vključuje stvarne sezname in obrazce (osebe, podjetja) z uporabo `packages/ui`. Po vsakem bistvenem dodatku v `apps/module-crm` zabeležite, katere komponente ste dodali in katere podatke zajemajo.

## GitHub in spremljanje faz
- Vsaka faza ali vmesni korak se objavi na https://github.com/zorkojaka/AIntel; če faza zahteva več commitov, naj ima vsak commit ime `FAZA<n>-<del>: opis` (npr. `FAZA1-CRM - people endpoints`).
- Imena commitov naj sledijo imenu faze in koraka, da je jasna povezava med zgodovino git-a in načrti.
- V to datoteko zapišite, kje je commit, npr. `Commit: CORE - osnovna struktura (branch: faza0-core)`.

## Prevzem modulov
- Če agent prevzame modul, navede `Modul: <ime>`, `Phase: <nova faza>`, `Start: <datum>`, `Status: in progress`, skupaj s povezavami do relevantnih `docs/faze/` dokumentov.
- Komunikacija poteka v dokumentih, ne v zasebnih kanalih – tako ostane sledljivost in jasen prehod nalog.
- Pred zaključkom naloge preverite `docs/TODO.md`, označite status in dodajte kratke povzetke v `docs/ARHITEKTURA.md`, `docs/KOORDINACIJA.md` in `docs/faze/<faza>.md`.

### Agent Codex – Projekti (zaključek)
1. **Začetne naloge**: Ustvaril sem `modules/projekti` z Mongoose modelom, API-kontrolerjem (CRUD + confirm-phase + timeline) in testom ter dokumentacijo v `docs/faze/02-Projekti.md`. Frontend je dobil `apps/module-projects`, `packages/ui` razširitev, CoreShell je integriral CRM in Projects module z novimi `dev:all`/`dev:stack` skripti.
2. **Izvedeni koraki**: Poskrbel sem, da backend bere `.env` (nov `mongo.ts`, `tsconfig` typeRoots), vsi paketi imajo `main/module` v `package.json`, Vite posluša na portu 5173, CRM/Projects exportata `src/index.ts`, in dokumenti (`docs/TODO.md`, `docs/ARHITEKTURA.md`, `docs/KOORDINACIJA.md`) so posodobljeni.
3. **Naslednji koraki**: Faza 2 je zaključena; lahko nadaljujete s fazo 3 (Cenik). Če se pojavi nov problem s projekti, preverite `pnpm run dev:stack` (ali `dev:all`), `http://localhost:5173/` in `GET /projekti`. Vse napake dokumentirajte v `02_2_PROJEKTI-test.md`.

### Agent Codex – Onboarding
1. **Začetne naloge**: Preden sem posegel v kodo, sem prebral `README.md`, `00_CORE.md`, `docs/ARHITEKTURA.md`, `docs/TODO.md`, `docs/MODULES.md`, `docs/KOORDINACIJA.md`, `docs/faze/01-CRM.md`, `docs/faze/01-2-CRM-UI.md`, `docs/faze/03-CENIK.md` in `docs/faze/05-NASTAVITVE.md`, kar so ključna navodila za modularno organizacijo, dokumentacijske norme, normalizacijo Unicode in koordinacijo.
2. **Izvedeni koraki**: Potrdil sem, da skupni `core/` helperji, enoten response/error standard, centralizirana dokumentacija in koordinacijski protokol ostajajo merilo nadaljnjih akcij.
3. **Naslednji koraki**: Nadaljujem z ogledom konkretnih modulov ali nalog, pri tem pa dosledno upoštevam navodila (ključne besede v angleščini, uporabniški tekst v slovenščini, Unicode normalizacijo, poročanje v dokumentih).

### Agent Codex – CRM (faza 6)
1. **Začetne naloge**: V navodilih `06_CRM_FINAL.md` in `docs/faze/06-CRM.md` sem identificiral potrebe po `ClientForm`, backend `/crm/clients` CRUD in integraciji v projekte; preveril sem tudi `docs/ARHITEKTURA.md`, `docs/TODO.md` in `docs/MODULES.md` za kontekst arhitekture in dokumentacije.
2. **Izvedeni koraki**: Implementiral sem novo shemo/kontroler/rute za `/crm/clients`, razvil `apps/module-crm/src/components/ClientForm.tsx`, osvežil `CRMPage` z `DataTable` + modalom in dodal `Dodaj stranko` gumb v `apps/module-projects/src/ProjectsPage.tsx`, kjer se kliče isti obrazec; dokumenti (README, TODO, ARHITEKTURA, MODULES, KOORDINACIJA) so dobili ustrezne zapise.
3. **Naslednji koraki**: Preizkusi `GET/POST/PUT /api/crm/clients`, validacijo DDV, modalno okno in gumb v modulih; v primeru dodatnih razširitev obvesti naslednjih agentov in ustrezno zabeleži spremembe.

### Agent Codex – Cenik (zaključeno)
Modul: Cenik
Phase: FAZA 3 – Cenik
Start: 2025-11-12
Status: completed
1. **Začetne naloge**: Prebral sem `03_CENIK.md`, `docs/faze/03-CENIK.md`, `docs/MODULES.md` in obstoječe backend/frontend module, da sem razumel zahteve in povezave med dokumenti.
2. **Izvedeni koraki**: Implementiral sem backend (`product.model.ts`, controller, routes, README) ter frontend (`apps/module-cenik` + `CenikPage`, manifest, FilterBar, modal) in povezavo prek `core-shell` (manifest, navigation, CSS, Vite proxy, Tailwind). Dodal sem debounced filter bar, modal urejanje, seed skripto in dokumentacijo (`docs/MODULES.md`, `docs/ARHITEKTURA.md`, `docs/TODO.md`, `docs/faze/03-CENIK.md`, `docs/KOORDINACIJA.md`).
3. **Naslednji koraki**: Nadaljuj s fazo 4 (Nastavitve) – preglej `docs/04_NASTAVITVE.md`, definiraj nieuwe `/settings` endpoints in UI, ter preveri morebitne dodatne zahteve za lokalizacijo ali dashboard metrike.

### Agent Codex – Finance (faza 5)
1. **Začetne naloge**: Referenca na `05_FINANCE.md` in navodila faze 5 – model FinanceEntry, API ter integracija s core shellom.
2. **Izvedeni koraki**: Dodan je modul `backend/modules/finance` (model, kontroler, rute, README), registracija v `backend/routes.ts`, nov frontend `apps/module-finance` z tabelo računov in grafi ter vključitev manifesta v `apps/core-shell`.
3. **Naslednji koraki**: Pripraviti povezavo z realno bazo (Mongo), razširiti API za analitiko po stroškovnih mestih in povezati modul s CRM/Cenik podatki, ko bodo ti moduli na voljo.

### Agent GPT-5.1-Codex – Projekti backend
1. **Začetne naloge**: Prebral sem `README.md`, `00_CORE.md`, `01_CRM.md`, `01_2_FRONTEND.md`, `02_PROJEKTI.md`, `03_CENIK.md`, `04_NASTAVITVE.md`, `05_FINANCE.md`, `06_CRM_FINAL.md`, `MOJA-NAVODILA.md`, `docs/ARHITEKTURA.md`, `docs/TODO.md`, `docs/MODULES.md`, `docs/KOORDINACIJA.md` ter `docs/faze/01-CRM.md`, `docs/faze/01-2-CRM-UI.md`, `docs/faze/03-CENIK.md`, `docs/faze/05-NASTAVITVE.md`, `docs/faze/06-CRM.md`.
2. **Načrtovani koraki**: Dodati backend funkcionalnosti za modul Projekti, kot jih nakazujejo gumbi in obstoječi frontend v `apps/module-projects`, z upoštevanjem obstoječih core helperjev in response standarda.
