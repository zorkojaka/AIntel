# Projekti backend – poročilo o funkcionalnostih

Dokument povzema zahteve, ki jih narekuje modul `module-projects`, in opisuje, kako so posamezne funkcionalnosti implementirane na strani API-ja in povezane s frontendom.

## Stanje funkcionalnosti
- [x] Nalaganje seznama projektov (`GET /api/projects`)
- [x] Pridobivanje podrobnosti posameznega projekta (`GET /api/projects/:id`)
- [x] Ustvarjanje novega projekta z validacijo vhodnih podatkov (`POST /api/projects`)
- [x] Posodabljanje statusov projektov in časovnice (`POST /api/projects/:id/status`)
- [x] Upravljanje verzij ponudb (ustvari, pošlji) (`POST /api/projects/:id/offers`, `/offers/:offerId/send`)
- [x] Potrjevanje ponudb z avtomatskim generiranjem naročilnic, delovnih nalogov in dobavnic (`/offers/:offerId/confirm`)
- [x] Preklic potrditve ponudbe in čiščenje povezanih dokumentov (`/offers/:offerId/cancel`)
- [x] Označevanje aktivne ponudbe brez sprožitve logistike (`/offers/:offerId/select`)
- [x] Potrjevanje dobavnic in prehod v fazo izvedbe (`POST /api/projects/:id/deliveries/:deliveryId/receive`)
- [x] Shranjevanje podpisa ter zaključek projekta (`POST /api/projects/:id/signature`)

## Opis izvedbe

### Nalaganje seznama projektov
- `listProjects` v `backend/modules/projects/controllers/project.controller.ts` vrne strnjene podatke (`ProjectSummary`) in upošteva seed podatke iz `schemas/project.ts`, da UI v `ProjectList` takoj izriše tabelo s filtri. Frontend kliče `/api/projects` ob mountu `ProjectsPage` in iz dobljenih podatkov zgradi stanje `projects`.

### Podrobnosti posameznega projekta
- `getProject` preveri obstoj projekta prek helperja `findProject` in vrača celoten `Project` objekt, ki vsebuje postavke, ponudbe, logistične dokumente, timeline in predloge. `ProjectsPage.loadProjectDetails` nato mapira podatke na `ProjectDetails`, kar omogoči `ProjectWorkspace` komponenti prikaz zavihkov in akcijskih gumbov.

### Ustvarjanje projekta
- `createProject` validira prisotnost `title` in `customer.name`, ustvari ID (prek `nextProjectId`), inicializira vse kolekcije (items, offers, timeline …) ter doda začetni timeline dogodek "Projekt ustvarjen". Frontend gumb "Nov projekt" kliče `POST /api/projects` in seznam osveži z novim zapisom.

### Posodabljanje statusov
- `updateStatus` dovoli le statuse iz `['draft','offered','ordered','in-progress','completed','invoiced']`, osveži stanje in zabeleži `timeline` dogodek tipa `status-change`. `ProjectWorkspace` omogoča izbiro statusa prek `Select` in vsako spremembo pošlje na API.

### Upravljanje verzij ponudb
- `addOffer` izračuna vrednost ponudbe (`calculateOfferAmount`) iz trenutnih postavk, generira novo verzijo ter posodobi `offerAmount` in timeline. `sendOffer` spremeni status posamezne verzije v `sent` in doda timeline vnos "Ponudba poslata". Uporabniški gumbi "Nova verzija" in "Pošlji" kličejo ustrezne POST rute.

### Potrjevanje ponudb in avtomatska logistika
- `confirmOffer` označi izbrano verzijo kot `accepted`, generira naročilnice (`createPurchaseOrders`), delovni nalog in povezane dobavnice ter projekt postavi v status `ordered`. Timeline prejme več dogodkov: potrditev ponudbe, ustvarjene naročilnice, delovni nalog in statusna sprememba. V UI gumb "Potrdi" hkrati preklopi na zavihek logistike.

### Preklic potrditve
- `cancelConfirmation` vrne ponudbo nazaj v stanje `sent`, odstrani naročilnice/dobavnice/delovne naloge ter status nastavi nazaj na `offered`. Timeline beleži preklic, frontendu pa omogoča ponovno potrjevanje iste ali druge verzije.

### Označevanje izbrane ponudbe
- `selectOffer` zgolj nastavi `isSelected` na konkretni verziji brez sprožitve logistike, kar je uporabno za primerjavo ponudb. UI uporablja to akcijo ob kliku "Označi kot izbrano".

### Potrjevanje dobavnic
- `receiveDelivery` nastavi prejeto količino in datum za izbrano dobavnico, posodobi povezano naročilnico v status `delivered` in, če so vse dobavnice potrjene, prestavi projekt v status `in-progress` (ter zapiše timeline). V `ProjectWorkspace` gumb "Potrdi prejem" kliče ustrezno ruto in posodobi seznam dobavnic.

### Shranjevanje podpisa
- `saveSignature` zahteva `signerName`, zapiše dogodek tipa `execution` z metapodatki o podpisniku ter status spremeni v `completed`. Komponenta `SignaturePad` po uspešnem podpisu pošlje sliko + ime na backend in prikaže toast o uspehu.
