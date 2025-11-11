# 👥 Faza 1: CRM – Upravljanje stikov in podjetij

## 🎯 Cilj
Vzpostavi CRM modul z osnovnimi entitetami:
- Osebe (kontakti)
- Podjetja (organizacije)
- Povezava oseb s podjetji
- Zgodovina interakcij (opombe, klici)
- Povezava kontaktov s projekti

---

## 📂 Struktura modula (v `modules/crm/`)

```
/modules/crm
  ├─ routes/
  │    ├─ people.ts
  │    ├─ companies.ts
  │    └─ notes.ts
  ├─ controllers/
  ├─ schemas/
  │    ├─ Person.ts
  │    ├─ Company.ts
  │    └─ Note.ts
  ├─ services/
  └─ README.md
```

---

## 🧠 Entitete

### 🧑 Person (kontakt)
| Polje         | Tip       | Opis                            |
|---------------|-----------|---------------------------------|
| first_name    | String    | Ime                            |
| last_name     | String    | Priimek                         |
| email         | String    | E-pošta                         |
| phone         | String    | Telefonska številka             |
| company_id    | ObjectId  | Referenca na `Company`          |
| project_ids   | [ObjectId]| Projekti povezani s kontaktom   |
| notes         | [ObjectId]| Interna zgodovina / komunikacija|

---

### 🏢 Company (podjetje)
| Polje         | Tip     | Opis                        |
|---------------|---------|-----------------------------|
| name          | String  | Naziv podjetja             |
| vat_id        | String  | DDV številka                |
| address       | String  | Naslov                     |
| phone         | String  | Telefonska številka        |
| email         | String  | E-pošta                    |
| persons       | [ObjectId] | Kontakti podjetja      |
| notes         | [ObjectId] | Notranje opombe         |

---

### 📝 Note (interakcija)
| Polje         | Tip     | Opis                           |
|---------------|---------|--------------------------------|
| content       | String  | Besedilo                      |
| entity_type   | Enum    | `person` ali `company`        |
| entity_id     | ObjectId| Povezano podjetje ali oseba   |
| created_by    | ObjectId| Kdo je zapisal                |
| created_at    | Date    | Datum                         |

---

## 📊 Endpoints (osnovni)

- `GET /crm/people` – seznam kontaktov
- `POST /crm/people` – nov kontakt
- `PUT /crm/people/:id` – spremeni kontakt
- `DELETE /crm/people/:id` – izbriši kontakt

- `GET /crm/companies` – podjetja
- `POST /crm/companies` – novo podjetje
- `GET /crm/companies/:id` – s kontaktnimi osebami
- `GET /crm/notes/:entityType/:id` – opombe za stik ali podjetje

---

## 🧪 Testiranje

- Dodaj 2 podjetji, 3 osebe in poveži jih
- Vnesi nekaj zapiskov (notes)
- Preveri API in dashboard povezavo
- Naj kontakt iz CRM deluje tudi v modulu Projekti (če aktiven)

---

## 📝 Dokumentacija

Dodaj:
- `modules/crm/README.md` z vsemi polji in primeri
- Posodobi `ARHITEKTURA.md` s strukturo CRM
- Označi napredek v `docs/TODO.md`

---

## 📌 Pravila

- Ključi v angleščini (`first_name`, `vat_id`)
- Besedila v slovenščini (uporabi Unicode support)
- Ne podvajaj logike – ponovne funkcije daj v `core/` ali `utils/`
