# Projekti modul

Modul `projekti` upravlja življenjski cikel projektov, s povezavami v CRM in temeljnimi fazami od ponudbe do računa. Vse rute uporabljajo globalno `normalizeUnicode` in delijo JSON standard iz `core/response.ts`.

## Model
- `Project` (`modules/projekti/models/Project.ts`) vsebuje: `project_id`, `name`, `status`, `company_id`, `contact_id`, `city`, `startDate`, `endDate`, `notes`, `documents`, `timeline`.
- `TimelineEvent` (`modules/projekti/models/TimelineEvent.ts`) z fazami `offer/order/workOrder/deliveryNote/invoice`.

## Rute
- `GET /projekti` – seznam projektov z opcijskimi filtri `status`, `search`, `company`, `contact`.
- `POST /projekti` – ustvari projekt (naziv, stranka, kontakt so obvezni); inicializira časovnico in shrani referenco v CRM kontakta.
- `GET /projekti/:id` – podrobnosti projekta (sprejme `_id` ali `project_id`).
- `PATCH /projekti/:id` – posodobi osnovne podatke in reference (služijo validacije CRM entitet).
- `DELETE /projekti/:id` – izbriše projekt, če je še v stanju `draft`.
- `POST /projekti/:id/confirm-phase` – potrdi eno fazo (`offer`, `order`, `workOrder`, `deliveryNote`, `invoice`), ustvari referenco dokumenta, posodobi status in časovnico.
- `GET /projekti/:id/timeline` – razloži časovnico brez dodatne polne strukture.

## Integracije
- Kontroler preveri, da `company_id` in `contact_id` obstajata v CRM modulih.
- `confirm-phase` se opira na ID-je dokumentov, zato uporablja `Types.ObjectId` kot simulacijo povezanih poslovnih dokumentov.
