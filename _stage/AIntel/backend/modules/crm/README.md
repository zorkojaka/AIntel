# CRM module

CRM handles contacts, companies, clients, and notes while keeping the shared JSON response format plus the `normalizeUnicode` middleware and `core/response.ts`.

## Schemas
- `Person` (`modules/crm/schemas/person.ts`): `first_name`, `last_name`, `email`, `phone`, `company_id`, `project_ids`, `notes`.
- `Company` (`modules/crm/schemas/company.ts`): `name`, `vat_id`, `address`, `phone`, `email`, `persons`, `notes`.
- `Note` (`modules/crm/schemas/note.ts`): `content`, `entity_type`, `entity_id`, `created_by`, `created_at`.
- `CrmClient` (`modules/crm/schemas/client.ts`): `name`, `type`, `street`, `postalCode`, `postalCity`, `address`, `vat_number`, `email`, `phone`, `contact_person`, `tags`, `notes`, timestamps, and `isComplete`.

## Routes
- `GET /crm/people` – returns the list of persons (with `company_id` populated).
- `POST /crm/people` – creates a new contact; you can link it to a company, projects or notes.
- `PUT /crm/people/:id` – updates a contact.
- `DELETE /crm/people/:id` – deletes a contact and removes the reference from the company.
- `GET /crm/companies` – returns companies.
- `POST /crm/companies` – creates a company record.
- `GET /crm/companies/:id` – returns company details plus linked contacts.
- `GET /crm/notes/:entityType/:entityId` – returns notes (entityType = `person` or `company`).
- `GET /crm/clients` – returns clients with fields (name, type, VAT, tags, address components, createdAt, isComplete).
- `POST /crm/clients` – creates a client; VAT is optional, but isComplete flags missing fields so the UI can show an alert when e.g. a company still lacks VAT.
- `GET /crm/clients/:id`, `PUT /crm/clients/:id`, `DELETE /crm/clients/:id` – view, edit, delete clients while reusing the shared response helpers.

## Extensions
1. Add new controllers inside `modules/crm/controllers` (notes history, timeline, etc.).
2. Surface metrics in `modules/dashboard` (e.g. number of incomplete clients).
3. Always reuse `core/response`, `core/errorHandler`, and `utils/normalizeUnicode`.
