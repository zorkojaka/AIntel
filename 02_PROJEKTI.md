# 🏗️ Faza 2: PROJEKTI – Upravljanje projektov in dokumentov

## 🎯 Cilj
Vzpostaviti celovit sistem za upravljanje projektov, vključno z:
- Evidenco projektov
- Statusno logiko in časovnico izvedbe
- Več verzijami ponudb
- Pretvorbami dokumentov (ponudba → naročilnica → delovni nalog → dobavnica → račun)
- Prikazom vseh faz v timeline komponenti
- Povezavo z dokumenti in CRM

---

## 🧱 1. Struktura mape `modules/projects`

```
/modules/projects
  ├─ routes/
  │    ├─ index.ts          # Seznam projektov, filter
  │    ├─ timeline.ts       # Timeline dogodki
  ├─ controllers/
  ├─ schemas/
  │    ├─ Project.ts
  │    ├─ TimelineEvent.ts
  ├─ ui/
  │    ├─ ProjectDetail.tsx
  │    ├─ TimelineWidget.tsx
  └─ README.md
```

---

## 🧠 2. Model: Project

| Polje         | Tip       | Opis                                |
|---------------|-----------|-------------------------------------|
| project_id    | Number    | Številka projekta (1300+)          |
| name          | String    | Npr. "Projekt Novak - Kranj"     |
| status        | Enum      | draft / confirmed / scheduled / executed / closed |
| contact_id    | ObjectId  | Referenca na CRM osebo             |
| company_id    | ObjectId  | Referenca na CRM podjetje          |
| city          | String    | Lokacija                           |
| timeline      | [ObjectId]| Povezani `TimelineEvent`           |
| docs          | [ObjectId]| Dokumenti (ponudbe, računi …)      |
| created_at    | Date      | Datum začetka                      |

---

## 📈 3. Model: TimelineEvent

| Polje         | Tip       | Opis                               |
|---------------|-----------|------------------------------------|
| type          | Enum      | OFFER_SENT, OFFER_ACCEPTED, WO_ISSUED, … |
| related_doc   | ObjectId  | Referenca na dokument              |
| confirmed     | Boolean   | Potrjeno ali ne                   |
| created_by    | ObjectId  | Kdo je dogodek sprožil            |
| created_at    | Date      | Datum dogodka                     |

---

## 🧭 4. UI Komponente

### 🗃️ Seznam projektov (`/projects`)
- Filter po statusu in kontaktu
- Gumb “Nov projekt”

### 🔍 Detail projekta
- Info: kontakt, kraj, status
- Dokumenti: povezani PDF-ji, verzije, pretvori
- Timeline: potrjevanje faz, dodajanje dogodkov
- Navigacija z zavihki

### ⚙️ Potrjevanje
- Gumbi za potrjevanje ponudbe → naročilnica → delovni nalog → dobavnica → račun
- Ob potrditvi → kreiraj nov dokument + timeline event + posodobi status

---

## 🔗 5. API konci

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `POST /projects/:id/confirm-phase`
- `GET /projects/:id/timeline`

---

## ✅ 6. Test scenarij

- Ustvari projekt “1301 - Projekt Novak - Kranj”
- Dodaš 2 verziji ponudbe (PDF)
- Potrdiš 1 → ustvari se naročilnica
- Naročilnico potrdiš → termin
- Dobavnico potrdiš → kreira se račun
- Vsi dokumenti so vidni + timeline prikazuje dogodke

---

## 📚 7. Dokumentacija

- `modules/projects/README.md`
- Posodobi `ARHITEKTURA.md`
- Označi TODO v `docs/TODO.md`

---

## 🔐 Pravila

- Ključi v angleščini, besedilo v slovenščini
- Podpora za šumnike (UTF-8, NFC normalizacija)
- Ne podvajaj logike – skupni deli naj gredo v `core/` ali `utils/`
