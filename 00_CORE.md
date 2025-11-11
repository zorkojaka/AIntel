# 🧠 Faza 0: CORE – Navodila za agenta

## 🎯 Cilj
Vzpostavi osnovno ogrodje aplikacije AIntel, ki vključuje:
- Modularno strukturo map
- MongoDB povezavo z health-checkom
- Unicode normalizacijo (NFC)
- Osnovni dashboard z razširljivimi metrikami
- Enoten JSON API odgovor in error handler
- Začetno dokumentacijo za projekt

---

## 🗂️ 1. Struktura map

```
/backend
  ├─ core/
  ├─ modules/
  │    └─ dashboard/
  ├─ db/
  ├─ utils/
  ├─ docs/
```

---

## 🔌 2. Povezava z MongoDB (`db/mongo.ts`)

- Uporabi knjižnico `mongoose`
- Nastavitve iz `.env`:
  ```env
  MONGO_URI=...
  MONGO_DB=aintel
  ```
- Health-check route `GET /health` naj vrne `{ connected: true }` ali napako

---

## 🔠 3. Unicode podpora

- `utils/normalizeUnicode.ts`: rekurzivna NFC normalizacija (uporabi `WeakMap`)
- Middleware za:
  - `req.body`
  - `req.query`
  - `req.params`

---

## 💬 4. JSON Response standard

- `core/response.ts`:
  ```ts
  res.success(data)
  res.fail(errorMessage, statusCode)
  ```
- Globalni `errorHandler` za vse napake

---

## 📊 5. Dashboard modul (`modules/dashboard/`)

- Endpoint `GET /dashboard/stats`
- Vrača dummy metrike npr. `{ users: 0, projects: 0 }`
- Pripravljen za razširitve (drugi moduli lahko prispevajo metrike)

---

## 🧭 6. Navigacija & layout

- Če obstaja frontend (npr. v React):
  - `shared/Layout.tsx` komponenta z menijem
  - Prikaz povezav do vseh aktivnih modulov

---

## 📚 7. Dokumentacija

- Dodaj:
  - `docs/ARHITEKTURA.md` (razdelek “CORE”)
  - `docs/TODO.md` (označi opravljeno)
  - `modules/dashboard/README.md`

---

## ✅ 8. Testiranje

- `npm run dev` naj zažene aplikacijo brez napak
- `GET /health` deluje
- Dashboard vrača dummy metrike
- Unicode test: pošlji podatke z `č, š, ž` in preveri pravilnost
- Dokumentacija naj bo ažurna

---

## 🔐 Pravila

- Vse spremenljivke in ključi → angleščina
- Vse uporabniško besedilo → slovenščina (s pravilnimi šumniki)
- Ne podvajaj logike – skupne funkcije daj v `core/` ali `utils/`
