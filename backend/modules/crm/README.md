# CRM modul

CRM modul upravlja kontakte, podjetja in povezane opombe. Sledi enotnemu JSON odgovoru ter uporablja `normalizeUnicode` middleware in `core/response.ts`.

## Sheme
- `Person` (`modules/crm/schemas/person.ts`): `first_name`, `last_name`, `email`, `phone`, `company_id`, `project_ids`, `notes`.
- `Company` (`modules/crm/schemas/company.ts`): `name`, `vat_id`, `address`, `phone`, `email`, `persons`, `notes`.
- `Note` (`modules/crm/schemas/note.ts`): `content`, `entity_type`, `entity_id`, `created_by`, `created_at`.

## Rute
- `GET /crm/people` – vrne seznam kontaktov, (`company_id` populiran).
- `POST /crm/people` – ustvari kontakt (po želji dodaj `company_id`, `project_ids`, `notes`).
- `PUT /crm/people/:id` – posodobi kontakt.
- `DELETE /crm/people/:id` – izbriše kontakt in odstrani referenco iz podjetja.
- `GET /crm/companies` – vrne podjetja.
- `POST /crm/companies` – ustvari podjetje.
- `GET /crm/companies/:id` – vrne podrobnosti podjetja in povezane kontakte.
- `GET /crm/notes/:entityType/:entityId` – vrne opombe (`entityType` je `person` ali `company`).

## Razširitve
1. Dodaj nove kontrolerje v `modules/crm/controllers` (npr. `notesService`, `history`).
2. Predstavi metrike v `modules/dashboard` (npr. število kontaktov/pogodb).
3. Uporabi `core` helperje (npr. `response` + `errorHandler`) za vsak nov endpoint.
